import ts from "typescript";
import {readFileSync} from 'fs';
import VinylFile from 'vinyl';
import { info } from "../utils/logs";
import { compileControllers } from "./compile-controllers";
import {normalize} from 'path';
// const GRIDFW_PACKAGE_NAME= 'gridfw';


/** 
 * Compile typescript files
 */
export function compile(
	/** Files to compile */
	files: Map<string, VinylFile>,
	compilerOptions: ts.CompilerOptions,
	pretty:boolean
): Map<string, VinylFile>{
	//* Create Program Host
	const pHost= ts.createCompilerHost(compilerOptions, true);
	pHost.readFile= function(fileName: string){
		var f= files.get(normalize(fileName));
		if(f!=null && f.isBuffer()) return f.contents.toString('utf-8');
		else return readFileSync(fileName, 'utf-8');
	};
	//* Create Program
	const filePaths= Array.from(files.keys());
	const program= ts.createProgram(filePaths, compilerOptions, pHost);
	//* Prepare modif map
	const filesMap:Map<string, ts.SourceFile>= new Map();
	for(let i=0, len= filePaths.length; i<len; ++i){
		let filePath= filePaths[i];
		filesMap.set(filePath, program.getSourceFile(filePath)!);
	}
	//* Source files
	for(let i=0, len= filePaths.length; i<len; ++i){
		//* Compile controllers
		compileControllers(program, filePaths[i], filesMap, pretty);
	}
	//* Save data
	info('>> Printing result...')
	filesMap.forEach(function(srcFile, filePath){
		files.get(filePath)!.contents= Buffer.from(ts.createPrinter().printFile(srcFile));
	});
	info('>> Done.')
	//* Return
	return files;
}

