import ts from "typescript";
import {readFileSync} from 'fs';
import VinylFile from 'vinyl';
import { info } from "../utils/logs";
import { compileControllers } from "./compile-controllers";
// const GRIDFW_PACKAGE_NAME= 'gridfw';


/** 
 * Compile typescript files
 */
export function compile(
	/** Files to compile */
	files: Map<string, VinylFile>,
	compilerOptions: ts.CompilerOptions,
	pretty:boolean
): VinylFile[]{
	//* Create Program Host
	const pHost= ts.createCompilerHost(compilerOptions, true);
	pHost.readFile= function(fileName: string){
		var f= files.get(fileName);
		if(f!=null && f.isBuffer()) return f.contents.toString('utf-8');
		else {
			info(`Load file from disk>> ${fileName}`);
			return readFileSync(fileName, 'utf-8');
		}
	};
	//* Create Program
	const filePaths= Array.from(files.keys());
	const program= ts.createProgram(filePaths, compilerOptions, pHost);
	//* Source files
	for(let i=0, len= filePaths.length; i<len; ++i){
		let filePath= filePaths[i];
		let sourceFile= program.getSourceFile(filePath)!;
		//* Compile controllers
		sourceFile= compileControllers(program, sourceFile, files);
		//* Update file's data
		files.get(filePath)!.contents= Buffer.from(ts.createPrinter().printFile(sourceFile));
	}
	//* Return
	return Array.from(files.values());
}

