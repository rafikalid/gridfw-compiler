import { compile as compileTypescript } from '@src/typescript/typescript';
import Through from 'through2';
import Vinyl from "vinyl";
import {readFileSync} from 'fs';
import ts from "typescript";
import type {Transform} from 'stream';

/** Gulp options */
export interface GulpOptions{
	tsConfig: string|ts.CompilerOptions
	pretty:boolean
}
/** Adapter for gulp */
export function createGulpPipe({tsConfig, pretty=true}:GulpOptions){
	const files: Map<string, Vinyl>= new Map();
	if(typeof tsConfig==='string') tsConfig= parseTsConfig(tsConfig);
	function collect(file: Vinyl, _:any, cb: Through.TransformCallback){
		files.set(file.path, file);
		cb();
	}
	function exec(this: Transform, cb: () => void){
		var resp= compileTypescript(files, tsConfig as ts.CompilerOptions, pretty);
		for(let i=0, len= resp.length; i<len; ++i)
			this.push(resp[i]);
		cb();
	}
	return Through.obj(collect, exec);
}

/** Parse tsConfig */
export function parseTsConfig(tsConfigPath: string){
	//* Parse tsConfig
	var tsP= ts.parseConfigFileTextToJson(tsConfigPath, readFileSync(tsConfigPath, 'utf-8'));
	if(tsP.error) throw new Error("Config file parse fails:" + tsP.error.messageText.toString());
	var tsP2= ts.convertCompilerOptionsFromJson(tsP.config.compilerOptions, process.cwd(), tsConfigPath);
	if(tsP2.errors?.length) throw new Error("Config file parse fails:" + tsP2.errors.map(e=> e.messageText.toString()));
	return tsP2.options;
}