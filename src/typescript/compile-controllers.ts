import { _errorFile } from "@src/utils/errors";
import { debug, info } from "@src/utils/logs";
import ts, { createIdentifier } from "typescript";
import { join, relative, dirname, normalize } from 'path';
import Glob from 'glob';
import { _importName } from "@src/utils/get-import";
import Pug from 'pug';
import { findChildByKind } from "@src/utils/typescript-utils";

/** Compile controllers */
export function compileControllers(program: ts.Program, filePath: string, filesMap: Map<string, ts.SourceFile>, pretty: boolean): void {
	var srcFile= program.getSourceFile(filePath)!;
	// var srcFile= filesMap.get(filePath)!;
	const typeChecker= program.getTypeChecker();
	//* Check if file has a target pattern
	var patterns= _getPattern(srcFile, typeChecker);
	if(patterns.size===0) return;
	//* Router: GET /route controller
	const results: Map<string, ParserResponse>= new Map();
	//* Parse found patterns
	const relativeDirname= relative(process.cwd(), dirname(srcFile.fileName));
	patterns.forEach(function(pattern){
		info(`Compile pattern>> ${pattern}`);
		//* Get Files using Glob
		const globPaths= _glob(pattern, relativeDirname);
		if (globPaths.length === 0)
			throw new Error(`Model Parser>> No file found for pattern: ${pattern} at ${srcFile.fileName}`);
		//* Parsing
		results.set(pattern, _parseFiles(globPaths, filesMap, program));
	});
	//* Inject resolved data
	info(`Inject data>> ...`);
	srcFile= _injectData(program, srcFile, results, pretty);
	//* Replace
	filesMap.set(filePath, srcFile);
}


/** Parser response */
interface ParserResponse{
	/** Controllers */
	controllers: ParsedController[]
	/** i18n */
	i18n: {
		filename:	string
		varname:	string
	}[]
}
/** Controllers interface */
interface ParsedController{
	baseRoutes: string[],
	methods: ParsedMethod[]
}
/** Parsed methods */
interface ParsedMethod{
	method: string,
	routes:	string[],
	controller:	{
		/** File path */
		file: string
		/** Controller's name */
		cName:	string
		/** Method's name */
		name:	string
		/** Is static method */
		isStatic: boolean
	}
}

/** Files compilation result */
interface CompileFilesResult{
	/** Imports */
	imports:	ts.Statement[]
	/** Code lines to add */
	lines:		ts.Statement[]
}

/** Get Controller load patterns from source file */
function _getPattern(sourceFile: ts.SourceFile, typeChecker: ts.TypeChecker) {
	const patterns: Set<string>= new Set();
	const queue:ts.Node[]= [sourceFile];
	var node, j=0;
	while(j<queue.length){
		node= queue[j++];
		if(ts.isCallExpression(node)){
			if(
				ts.isPropertyAccessExpression(node.expression)
				&& node.arguments?.length===1
				&& node.expression.name.getText()==='scan'
				&& typeChecker.getTypeAtLocation(node.expression.expression).symbol?.name === 'Gridfw'
			){
				if(node.arguments[0].kind!==ts.SyntaxKind.StringLiteral)
					throw new Error(`Expected static string as argument of Gridfw::scan. got "${node.getText()}" at ${_errorFile(sourceFile, node)}`);
				patterns.add(node.arguments[0].getText());
			}
		} else {
			queue.push(...node.getChildren());
		}
	}
	return patterns;
}

/** Get Glob files */
function _glob(pattern: string, relativeDirname: string): string[]{
	const patternArray= pattern.slice(1, pattern.length-1).split(',').map(e=> join(relativeDirname, e.trim()) );
	const files:string[]= [];
	const cwd= process.cwd();
	for(let i=0, len= patternArray.length; i<len; ++i){
		let f= Glob.sync(patternArray[i]);
		for(let j=0, jLen= f.length; j<jLen; ++j){
			let file= f[j];
			if(files.includes(file)===false){
				files.push(normalize(join(cwd, file)));
				debug('\t>', file);
			}
		}
	}
	return files;
}

/** Parse paths for controllers */
function _parseFiles(globPaths: string[], filesMap: Map<string, ts.SourceFile>, program: ts.Program): ParserResponse{
	var results: ParserResponse= {
		controllers: [],
		i18n: []
	};
	const compilerOptions= program.getCompilerOptions();
	for(let i=0, len= globPaths.length; i<len; ++i){
		//* Load file
		let filePath= globPaths[i];
		let srcFile= filesMap.get(filePath)!;
		if(srcFile==null)
			throw new Error(`Missing file from compilation pipline: ${filePath}`);
		//* If file needs imports (like pug runtime lib)
		const addedImports: ts.Statement[]= [];
		//* Parse
		srcFile= ts.transform(srcFile, [function(ctx:ts.TransformationContext): ts.Transformer<ts.Node>{
			return parseTs(program, ctx, srcFile, results, addedImports, compilerOptions);
		}], compilerOptions).transformed[0] as ts.SourceFile;
		//* Add imports
		if(addedImports.length>0){
			let f= ts.factory;
			srcFile= f.updateSourceFile(
				srcFile,
				addedImports.concat(srcFile.statements),
				false,
				srcFile.referencedFiles,
				srcFile.typeReferenceDirectives,
				srcFile.hasNoDefaultLib,
				srcFile.libReferenceDirectives
			);
		}
		//* Save file
		filesMap.set(filePath, srcFile);
	}
	return results;
}

/** Parse and compile each file */
function parseTs(
	program: ts.Program,
	ctx:ts.TransformationContext,
	srcFile: ts.SourceFile,
	results: ParserResponse,
	addedImports: ts.Statement[],
	compilerOptions: ts.CompilerOptions
): ts.Transformer<ts.Node>{
	const typeChecker= program.getTypeChecker();
	const f= ctx.factory;
	var resultItem: ParsedController;
	let controllersArr= results.controllers;
	var i18nArr= results.i18n;
	/** Pug import var */
	var pugImportVar: ts.Identifier|undefined= undefined;
	/** Printer, used to print pug function */
	var tsPrinter= ts.createPrinter();
	return _visitor;
	function _visitor(node:ts.Node): ts.Node{
		switch(node.kind){
			//* Controllers
			case ts.SyntaxKind.ClassDeclaration:
				let cNode= node as ts.ClassDeclaration;
				// Check for wrapper "route"
				let classDecorators= cNode.decorators;
				if(classDecorators==null) break;
				for(let i=0, len= classDecorators.length; i<len; ++i){
					let deco= classDecorators[i].expression;
					let decoType: ts.Type;
					let symbName:string;
					if(
						ts.isCallExpression(deco)
						&& (decoType= typeChecker.getTypeAtLocation(deco.expression))
						&& (
							(symbName= decoType.symbol.name)==='route'
							|| symbName=== 'controller'
						)
					){
						// Route
						resultItem= {
							baseRoutes: _argExtractString(deco.arguments, symbName, srcFile, node),
							methods: []
						};
						controllersArr.push(resultItem);
						// Remove "route" decodator
						node= f.createClassDeclaration(
							classDecorators.filter((_, idx)=> idx!==i),
							cNode.modifiers, cNode.name, cNode.typeParameters, cNode.heritageClauses, cNode.members);
						// Go through members
						node= ts.visitEachChild(node, _visitor, ctx);
						break;
					}
				}
				break;
			case ts.SyntaxKind.MethodDeclaration:
				let mNode= node as ts.MethodDeclaration;
				let mDecos= mNode.decorators;
				let filtredDeco: ts.Decorator[]= [];
				if(mDecos==null) break;
				for(let i=0, len= mDecos.length; i<len; ++i){
					let decoNode= mDecos[i]
					let deco= decoNode.expression;
					let decoType: ts.Type;
					if(
						ts.isCallExpression(deco)
						&& (decoType= typeChecker.getTypeAtLocation(deco.expression))
					){
						let symbName= decoType.symbol.name;
						switch(symbName){
							case 'get':
							case 'head':
							case 'post':
							case 'method':
							case 'ws':
								// @get("/route")
								resultItem.methods.push({
									method: symbName,
									routes: _argExtractString(deco.arguments, symbName, srcFile, node),
									controller: {
										file:	srcFile.fileName,
										cName:	(mNode.parent as ts.ClassDeclaration).name!.getText(),
										name:	mNode.name.getText(),
										isStatic: mNode.modifiers?.some(n=> n.kind===ts.SyntaxKind.StaticKeyword) ?? false
									}
								});
								break;
						}
					}
					// Keep deco
					filtredDeco.push(decoNode);
				}
				// Remove Gridfw decorators
				if(filtredDeco.length !== mDecos.length){
					node= f.updateMethodDeclaration(
						mNode,
						filtredDeco,
						mNode.modifiers,
						mNode.asteriskToken,
						mNode.name,
						mNode.questionToken,
						mNode.typeParameters,
						mNode.parameters,
						mNode.type,
						mNode.body
					);
				}
				break;
			//* I18N
			case ts.SyntaxKind.VariableStatement:
				for(
					let i=0,
					hasExport= node.modifiers?.some(e=> e.kind===ts.SyntaxKind.ExportKeyword) ?? false,
					varDeclarations= (node as ts.VariableStatement).declarationList.declarations,
					len= varDeclarations.length;
					i<len; ++i
				){
					let declaration= varDeclarations[i];
					let type= declaration.type;
					let s: ts.Symbol | undefined;
					if(
						type
						&& ts.isTypeReferenceNode(type)
						&& (s= typeChecker.getSymbolAtLocation(type.typeName))
						&& s.name==='I18N'
					){
						let varname= declaration.name.getText();
						if(hasExport===false) throw new Error(`Expected "export" keyword on i18n variable "${varname}" at ${_errorFile(srcFile, node)}`);
						i18nArr.push({
							filename:	srcFile.fileName,
							varname:	varname
						});
						// Parse fields
						node= _compileI18nObject(node, varname);
					}
				}
				break;
			//* Go through childs
			case ts.SyntaxKind.SyntaxList:
			case ts.SyntaxKind.SourceFile:
				node= ts.visitEachChild(node, _visitor, ctx);
				break;
		}
		return node;
	}
	/** Compile i18n object */
	function _compileI18nObject(node: ts.Node, i18nVarname: string){
		return ts.visitEachChild(node, _visitor, ctx);
		/** Visitor */
		function _visitor(node: ts.Node) :ts.Node{
			if(ts.isCallExpression(node)){
				let info= _importName(node.expression, typeChecker);
				if(info!=null && info.isGridfw && info.name==='i18nPug'){
					let arg= node.arguments[0];
					if(!ts.isStringLiteral(arg))
						throw new Error(`Expected static string as argument for "${node.expression.getText()}" at ${_errorFile(srcFile, node)}`);
					return _compilePug(arg.getText().slice(1, -1), i18nVarname) ?? node;
				}
			} else if(ts.isTaggedTemplateExpression(node)){
				let info= _importName(node.tag, typeChecker);
				if(info!=null && info.isGridfw && info.name==='i18nPug'){
					let arg= node.template;
					if(!ts.isNoSubstitutionTemplateLiteral(arg))
						throw new Error(`Expected static string (No Substitution Template Literal) as argument for "${node.tag.getText()}" at ${_errorFile(srcFile, node)}`);
					return _compilePug(arg.getText().slice(1, -1), i18nVarname) ?? node;
				}
			}
			return ts.visitEachChild(node, _visitor, ctx);
		}
	}
	/** Compile pug into function */
	function _compilePug(str: string, i18nVarname: string): ts.Node|undefined {
		// Check for pugImportVar
		if(pugImportVar==null){
			pugImportVar= f.createUniqueName('pug');
			addedImports.push(
				f.createExpressionStatement(
					f.createIdentifier('// @ts-ignore')
				),
				f.createImportDeclaration(undefined, undefined, f.createImportClause(
					false, pugImportVar, undefined
				), f.createStringLiteral('pug-runtime'))
			);
		}
		// Compile Pug
		str= '|'+str.split(/\n/).join("\n|");
		str= Pug.compileClient(str, {
			name: ' ',
			inlineRuntimeFunctions: false,
			globals: [i18nVarname],
			compileDebug: false,
			debug: false
		});
		var nd= ts.createSourceFile('any', str, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
		var fxNode= findChildByKind(nd, ts.SyntaxKind.FunctionDeclaration);
		if(fxNode==null) return;
		// Replace "pug" runtime var
		fxNode= ts.transform(fxNode, [function(ctx:ts.TransformationContext): ts.Transformer<ts.Node>{
			return _visitor;
			function _visitor(n: ts.Node): ts.Node{
				if(
					ts.isPropertyAccessExpression(n)
					&& n.expression.getText()==='pug'
				){
					return f.createPropertyAccessExpression(pugImportVar!, n.name);
				} else if(ts.isParameter(n)){
					return f.createParameterDeclaration(
						n.decorators, n.modifiers, n.dotDotDotToken, n.name, n.questionToken,
						n.type ?? f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
						n.initializer
					)
				} else if(ts.isVariableDeclaration(n)){
					return f.createVariableDeclaration(
						n.name, n.exclamationToken,
						n.type ?? f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
						n.initializer
					);
				} else if(ts.isCallExpression(n)){
					let exp= n.expression;
					if(
						ts.isPropertyAccessExpression(exp)
						&& exp.name.getText() === 'call'
					){
						let args: ts.Expression[]= [f.createThis()];
						for( let i=0, pr= (exp.expression as ts.FunctionExpression).parameters, len= pr.length; i<len; ++i ){
							args.push( f.createPropertyAccessExpression(f.createIdentifier('locals'), pr[i].name.getText()) );
						}
						let n2= ts.visitEachChild(n, _visitor, ctx) as ts.CallExpression;
						return f.updateCallExpression(
							n2, n2.expression, undefined, args
						);
					}
				}
				return ts.visitEachChild(n, _visitor, ctx);
			}
		}], compilerOptions).transformed[0];
		// print & return
		return f.createIdentifier(tsPrinter.printNode(ts.EmitHint.Unspecified, fxNode, nd));
	}
}


/** Check argument is string or array of string & extract theme */
function _argExtractString(args: ts.NodeArray<ts.Expression>, decoName: string, srcFile: ts.SourceFile, node: ts.Node): string[]{
	const result: string[]= [];
	const queue= Array.from(args);
	for(let i=0, len= queue.length; i<len; ++i){
		let n= queue[i];
		if(ts.isStringLiteral(n))
			result.push(n.getText());
		else if(ts.isArrayLiteralExpression(n)){
			queue.push(...n.elements);
			len= queue.length;
		} else {
			throw new Error(`Expected static strings as argument to "@${decoName}". at ${_errorFile(srcFile, node)}`);
		}
	}
	return result;
}

function _injectData(program: ts.Program, srcFile: ts.SourceFile, results: Map<string, ParserResponse>, pretty: boolean): ts.SourceFile {
	/** Import import methods from files */
	var imports: Map<string, Map<string, ts.Identifier>>= new Map();
	// Inject data
	srcFile= ts.transform(srcFile, [function(ctx:ts.TransformationContext): ts.Transformer<ts.Node>{
		return _injectdataVisitor(program, ctx, srcFile, results, imports, pretty);
	}], program.getCompilerOptions()).transformed[0] as ts.SourceFile;
	// Inject imports
	if(imports.size){
		let statements: ts.Statement[]= [];
		let f= ts.factory;
		const relativeDirname= relative(process.cwd(), dirname(srcFile.fileName));
		imports.forEach(function(blocks, fileName){
			let importPath= _relative(relativeDirname, fileName.replace(/\.ts$/,''));
			let specifiers: ts.ImportSpecifier[]= [];
			blocks.forEach(function(varId, className){
				specifiers.push(
					f.createImportSpecifier(f.createIdentifier(className), varId)
				);
			});
			statements.push(
				f.createImportDeclaration(
					undefined, undefined,
					f.createImportClause(false, undefined, f.createNamedImports(specifiers)),
					f.createStringLiteral(importPath)
				),
			);
		});
		statements.push(...srcFile.statements);
		srcFile= f.updateSourceFile(
			srcFile,
			statements,
			false,
			srcFile.referencedFiles,
			srcFile.typeReferenceDirectives,
			srcFile.hasNoDefaultLib,
			srcFile.libReferenceDirectives
		);
	}
	return srcFile;
}


/** iject visitor */
function _injectdataVisitor(
	program: ts.Program,
	ctx: ts.TransformationContext,
	srcFile: ts.SourceFile,
	results: Map<string, ParserResponse>,
	/** Collect import statements */
	imports: Map<string, Map<string, ts.Identifier>>,
	pretty: boolean
): ts.Transformer<ts.Node>{
	const typeChecker= program.getTypeChecker();
	const f= ctx.factory;
	return _visitor;
	/** Visitor */
	function _visitor(node: ts.Node): ts.Node{
		if(ts.isCallExpression(node)){
			if(
				ts.isPropertyAccessExpression(node.expression)
				&& node.arguments?.length===1
				&& node.expression.name.getText()==='scan'
				&& typeChecker.getTypeAtLocation(node.expression.getFirstToken()!).symbol.name === 'Gridfw'
			){
				let p= node.arguments[0].getText();
				let r= results.get(p);
				if(r==null) throw new Error(`Enexpected missing pattern ${p} at ${_errorFile(srcFile, node)}`);
				let block= _compileResults(r, node.expression.getFirstToken() as ts.Identifier);
				node= f.createCallExpression(
					f.createParenthesizedExpression(
						f.createFunctionExpression(
							undefined, undefined, undefined, undefined,
							[], undefined, f.createBlock(block, pretty)
						)
					),
					undefined, []
				)
			}
		} else {
			node= ts.visitEachChild(node, _visitor, ctx);
		}
		return node;
	}
	/** Compile data */
	function _compileResults(r: ParserResponse, varName: ts.Identifier): ts.Statement[]{
		var block: ts.Statement[]= [];
		//* Controllers
		for(let i=0, controllers= r.controllers, len= controllers.length; i<len; ++i){
			let item= controllers[i];
			if(item.methods.length===0) continue;
			// Create route
			let rt: ts.Identifier
			if(item.baseRoutes.length){
				rt= f.createUniqueName('route');
				block.push(f.createVariableStatement(undefined, [
					f.createVariableDeclaration(rt, undefined, undefined, f.createCallExpression(
						f.createPropertyAccessExpression(varName, 'route'),
						undefined, [f.createArrayLiteralExpression(item.baseRoutes.map(e=> f.createIdentifier(e)), pretty)]
					))
				]));
			} else {
				rt= varName;
			}
			// Add and Compile methods
			for(let j=0, methods= item.methods, jlen= methods.length; j<jlen; ++j){
				let m= methods[j];
				// Generate class import
				let c= m.controller;
				let clMap= imports.get(c.file);
				let classVar: ts.Identifier|undefined;
				if(clMap==null){
					clMap= new Map();
					imports.set(c.file, clMap);
					classVar= f.createUniqueName(c.cName);
					clMap.set(c.cName, classVar);
				} else {
					classVar= clMap.get(c.cName);
					if(classVar==null){
						classVar= f.createUniqueName(c.cName);
						clMap.set(c.cName, classVar);
					}
				}
				// Generate method
				let methodArgs: ts.Expression[];
				if(m.method==='method'){
					let targetMethod= m.routes[0] as string;
					let routes= m.routes.slice(1).map(e=> f.createIdentifier(e));
					methodArgs= [
						f.createIdentifier(targetMethod),
					];
					if(routes.length>0) methodArgs.push(f.createArrayLiteralExpression(routes, pretty))
				} else if(m.routes.length > 0) {
					methodArgs= [
						f.createArrayLiteralExpression(m.routes.map(e=> f.createIdentifier(e)), pretty),
					];
				} else {
					methodArgs= [];
				}
				// Add method declaration
				methodArgs.push(f.createPropertyAccessExpression(
					classVar,
					f.createIdentifier(c.isStatic===true ? c.name : `prototype.${c.name}`)
				));
				// push method block
				block.push(f.createExpressionStatement(f.createCallExpression(
					f.createPropertyAccessExpression(rt, m.method ),
					undefined, methodArgs
				)));
			}
		}
		//* I18N
		let i18nVars: ts.Identifier[]= [];
		for(let i=0, i18nArr= r.i18n, len=i18nArr.length; i<len; ++i){
			let i18n= i18nArr[i];
			//* Generate class import
			let clMap= imports.get(i18n.filename);
			let i18nVar: ts.Identifier|undefined;
			if(clMap==null){
				clMap= new Map();
				imports.set(i18n.filename, clMap);
				i18nVar= f.createUniqueName(i18n.varname);
				clMap.set(i18n.varname, i18nVar);
			} else {
				i18nVar= clMap.get(i18n.varname);
				if(i18nVar==null){
					i18nVar= f.createUniqueName(i18n.varname);
					clMap.set(i18n.varname, i18nVar);
				}
			}
			//* Add
			i18nVars.push(i18nVar);
		}
		if(i18nVars.length)
			block.push(f.createExpressionStatement(f.createCallExpression(
				f.createPropertyAccessExpression( varName, f.createIdentifier("_initI18n")),
				undefined, i18nVars
			)));
		return block;
	}
}

/** Relative path */
function _relative(from: string, to: string){
	var p= relative(from, to);
	p= p.replace(/\\/g, '/');
	var c= p.charAt(0);
	if(c!=='.' && c!=='/') p= './'+p;
	return p;
}

