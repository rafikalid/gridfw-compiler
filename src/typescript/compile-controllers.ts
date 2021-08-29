import { _errorFile } from "@src/utils/errors";
import { debug, info } from "@src/utils/logs";
import ts, { flattenDiagnosticMessageText } from "typescript";
import type Vinyl from 'vinyl';
import { join, relative, dirname, normalize } from 'path';
import Glob from 'glob';

/** Compile controllers */
export function compileControllers(program: ts.Program, filePath: string, filesMap: Map<string, ts.SourceFile>, pretty: boolean): void {
	var srcFile= filesMap.get(filePath)!;
	const typeChecker= program.getTypeChecker();
	//* Check if file has a target pattern
	var patterns= _getPattern(srcFile, typeChecker);
	if(patterns.size===0) return;
	//* Router: GET /route controller
	const results: Map<string, ParserResponse[]>= new Map();
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
				&& typeChecker.getTypeAtLocation(node.expression.getFirstToken()!).symbol.name === 'Gridfw'
			){
				if(node.arguments[0].kind!==ts.SyntaxKind.StringLiteral)
					throw new Error(`Expected static string as argument of Gridfw::scan. got "${node.getText()}" at ${_errorFile(sourceFile, node)}`);
				patterns.add(node.arguments[0].getText());
			}
		} else if(node.getChildCount()>0){
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
function _parseFiles(globPaths: string[], filesMap: Map<string, ts.SourceFile>, program: ts.Program): ParserResponse[]{
	var results: ParserResponse[]= [];
	for(let i=0, len= globPaths.length; i<len; ++i){
		//* Load file
		let filePath= globPaths[i];
		let srcFile= filesMap.get(filePath)!;
		if(srcFile==null)
			throw new Error(`Missing file from compilation pipline: ${filePath}`);
		//* Parse
		srcFile= ts.transform(srcFile, [function(ctx:ts.TransformationContext): ts.Transformer<ts.Node>{
			return parseTs(program, ctx, srcFile, results);
		}], program.getCompilerOptions()).transformed[0] as ts.SourceFile;
		//* Save file
		filesMap.set(filePath, srcFile);
	}
	return results;
}

/** Parse and compile each file */
function parseTs(program: ts.Program, ctx:ts.TransformationContext, srcFile: ts.SourceFile, results: ParserResponse[]): ts.Transformer<ts.Node>{
	const typeChecker= program.getTypeChecker();
	const f= ctx.factory;
	var resultItem: ParserResponse;
	return _visitor;
	function _visitor(node:ts.Node): ts.Node{
		switch(node.kind){
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
						&& deco.arguments.length===1
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
						results.push(resultItem);
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
										name:	mNode.name.getText()
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
			case ts.SyntaxKind.SyntaxList:
			case ts.SyntaxKind.SourceFile:
				node= ts.visitEachChild(node, _visitor, ctx);
				break;
		}
		return node;
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

function _injectData(program: ts.Program, srcFile: ts.SourceFile, results: Map<string, ParserResponse[]>, pretty: boolean): ts.SourceFile {
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
		srcFile= ts.factory.createSourceFile(statements, srcFile.endOfFileToken, srcFile.flags);
	}
	return srcFile;
}


/** iject visitor */
function _injectdataVisitor(
	program: ts.Program,
	ctx: ts.TransformationContext,
	srcFile: ts.SourceFile,
	results: Map<string, ParserResponse[]>,
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
		} else if(node.getChildCount()>0){
			node= ts.visitEachChild(node, _visitor, ctx);
		}
		return node;
	}
	/** Compile data */
	function _compileResults(r: ParserResponse[], varName: ts.Identifier): ts.Statement[]{
		var block: ts.Statement[]= [];
		for(let i=0, len= r.length; i<len; ++i){
			let item= r[i];
			if(item.methods.length===0) continue;
			// Create route
			let rt: ts.Identifier
			if(item.baseRoutes.length){
				rt= f.createUniqueName('route');
				block.push(f.createExpressionStatement(f.createCallExpression(
					f.createPropertyAccessExpression(varName, rt),
					undefined, item.baseRoutes.map(e=> f.createIdentifier(e))
				)));
			} else {
				rt= varName;
			}
			// Add and Compile methods
			for(let j=1, methods= item.methods, jlen= methods.length; j<jlen; ++i){
				let m= methods[j];
				// Generate class import
				let c= m.controller;
				let clMap= imports.get(c.file);
				let classVar: ts.Identifier|undefined;
				if(clMap==null){
					clMap= new Map();
					imports.set(c.file, new Map());
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
				if(m.method==='method'){
					let targetMethod= m.routes[0] as string;
					let routes= m.routes.slice(1).map(e=> f.createIdentifier(e))
					block.push(f.createExpressionStatement(f.createCallExpression(
						f.createPropertyAccessExpression(rt, m.method ),
						undefined, [
							f.createIdentifier(targetMethod),
							f.createArrayLiteralExpression(routes, pretty),
							f.createPropertyAccessExpression(classVar, c.name)
						]
					)));
				} else {
					block.push(f.createExpressionStatement(f.createCallExpression(
						f.createPropertyAccessExpression(rt, m.method ),
						undefined, [
							f.createArrayLiteralExpression(m.routes.map(e=> f.createIdentifier(e)), pretty),
							f.createPropertyAccessExpression(classVar, c.name)
						]
					)));
				}
			}
		}
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