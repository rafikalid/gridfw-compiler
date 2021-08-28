import { _errorFile } from "@src/utils/errors";
import { debug, info } from "@src/utils/logs";
import ts from "typescript";
import type Vinyl from 'vinyl';
import { join, relative, dirname, normalize } from 'path';
import Glob from 'glob';

/** Compile controllers */
export function compileControllers(program: ts.Program, filePath: string, filesMap: Map<string, ts.SourceFile>): void {
	const srcFile= filesMap.get(filePath)!;
	const typeChecker= program.getTypeChecker();
	//* Check if file has a target pattern
	var patterns= _getPattern(srcFile, typeChecker);
	if(patterns.size===0) return;
	//* Router: GET /route controller
	const routes: Map<string, ParserResponse[]>= new Map()
	//* Parse found patterns
	const relativeDirname= relative(process.cwd(), dirname(srcFile.fileName));
	patterns.forEach(function(pattern){
		info(`Compile pattern>> ${pattern}`);
		//* Get Files using Glob
		const globPaths= _glob(pattern, relativeDirname);
		if (globPaths.length === 0)
			throw new Error(`Model Parser>> No file found for pattern: ${pattern} at ${srcFile.fileName}`);
		//* Parsing
		_parseFiles(globPaths, filesMap, program, routes);
		
	});
	//* Inject resolved data
	//* Replace
	filesMap.set(filePath, srcFile);
}

/** Parser response */
interface ParserResponse{
	method: string,
	route:	string,
	controller:	{
		/** File path */
		file: string
		/** Controller's name */
		name: string
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
function _parseFiles(globPaths: string[], filesMap: Map<string, ts.SourceFile>, program: ts.Program, routes: Map<string, ParserResponse[]>): void{
	for(let i=0, len= globPaths.length; i<len; ++i){
		//* Load file
		let filePath= globPaths[i];
		let srcFile= filesMap.get(filePath)!;
		if(srcFile==null)
			throw new Error(`Missing file from compilation pipline: ${filePath}`);
		//* Parse
		srcFile= ts.transform(srcFile, [function(ctx:ts.TransformationContext): ts.Transformer<ts.Node>{
			return parseTs(program, ctx, srcFile, routes);
		}], program.getCompilerOptions()).transformed[0] as ts.SourceFile;
		//* Save file
		filesMap.set(filePath, srcFile);
	}
}

/** Parse and compile each file */
function parseTs(program: ts.Program, ctx:ts.TransformationContext, srcFile: ts.SourceFile, routes: Map<string, ParserResponse[]>): (node: ts.Node)=> ts.Node{
	const typeChecker= program.getTypeChecker();
	const f= ctx.factory;
	var currentRoute: string|undefined;
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
					if(
						ts.isCallExpression(deco)
						&& deco.arguments.length===1
						&& (decoType= typeChecker.getTypeAtLocation(deco.expression))
						&& decoType.symbol.name==='route'
					){
						// Route
						let arg= deco.arguments[0];
						if(arg.kind!==ts.SyntaxKind.StringLiteral)
							throw new Error(`Expected static string as argument to "@route". at ${_errorFile(srcFile, node)}`);
						currentRoute= arg.getText();
						currentRoute= currentRoute.slice(1, currentRoute.length-1); // remove quotes
						if(routes.has(currentRoute)===false)
							routes.set(currentRoute, []);
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
				if(mDecos==null) break;
				for(let i=0, len= mDecos.length; i<len; ++i){
					let deco= mDecos[i].expression;
					let decoType: ts.Type;
					if(
						ts.isCallExpression(deco)
						&& (decoType= typeChecker.getTypeAtLocation(deco.expression))
					){
						switch(decoType.symbol.name){
							case 'get':
								// @get("/route")
								break;
							case 'head':
								// @get("/route")
								break;
							case 'post':
								// @post("/route")
								break;
							case 'method':
								// @method("method-name")
								// @method("method-name", "/route")
								break;
						}
					}
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