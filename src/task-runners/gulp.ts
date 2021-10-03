import { compile as compileTypescript } from '@src/typescript/typescript';
import Through from 'through2';
import Vinyl from 'vinyl';
import { readFileSync } from 'fs';
import ts from 'typescript';
import type { Transform } from 'stream';
import EJS from 'ejs';
import Glob from 'glob';
import { createRequire } from 'module';
import { execModule } from '@src/utils/exec-modules';
import { dirname, basename, join } from 'path';

//TODO create converter

// Create require if es scope
const requireLib =
	//@ts-ignore
	typeof require === 'undefined' ? createRequire(import.meta.url) : require;

/** Adapter for gulp */
export function gulp(tsConfig: string | ts.CompilerOptions, pretty = true) {
	const files: Map<string, Vinyl> = new Map();
	if (typeof tsConfig === 'string') tsConfig = parseTsConfig(tsConfig);
	function collect(file: Vinyl, _: any, cb: Through.TransformCallback) {
		files.set(file.path, file);
		cb();
	}
	function exec(this: Transform, cb: () => void) {
		var cpFiles = compileTypescript(
			files,
			tsConfig as ts.CompilerOptions,
			pretty
		);
		var resp = Array.from(cpFiles.values());
		for (let i = 0, len = resp.length; i < len; ++i) this.push(resp[i]);
		cb();
	}
	return Through.obj(collect, exec);
}

/** Parse tsConfig */
export function parseTsConfig(tsConfigPath: string) {
	//* Parse tsConfig
	var tsP = ts.parseConfigFileTextToJson(
		tsConfigPath,
		readFileSync(tsConfigPath, 'utf-8')
	);
	if (tsP.error)
		throw new Error(
			'Config file parse fails:' + tsP.error.messageText.toString()
		);
	var tsP2 = ts.convertCompilerOptionsFromJson(
		tsP.config.compilerOptions,
		process.cwd(),
		tsConfigPath
	);
	if (tsP2.errors?.length)
		throw new Error(
			'Config file parse fails:' +
			tsP2.errors.map(e => e.messageText.toString())
		);
	return tsP2.options;
}

/**
 * Prepare views for final compiling
 * Apply i18n & precompiling logic
 */
export function gulpInitViews<T>(
	/** Glob selector to compiled time i18n files */
	i18nGlobPattern: string,
	/** Aditional data to the compiler */
	data?: T,
	/** i18n var name inside files */
	i18nVarName: string = 'i18n',
	/** Custom Compiler */
	render: (content: string, data: T) => string = _ejs
) {
	// Load i18n files
	var i18nMap = _resolveI18n(i18nGlobPattern, i18nVarName);
	// Executor
	return Through.obj(function (
		file: Vinyl,
		_: any,
		cb: Through.TransformCallback
	) {
		var err: Error | null = null;
		try {
			// Exclude streams
			if (file.isStream())
				throw new Error(
					`Streams are not supported. Input file: ${file.path}`
				);
			// Get content
			var content = file.isBuffer()
				? file.contents.toString('utf-8')
				: readFileSync(file.path, 'utf-8');
			// Compile content
			var errors: any[] = [];
			const fileDir = dirname(file.path);
			const fileName = basename(file.path);
			i18nMap.forEach((i18n) => {
				try {
					// Compile
					let compiled = render(content, { ...data, i18n } as any as T);
					// Save
					this.push(new Vinyl({
						base: file.base,
						cwd: file.cwd,
						path: join(fileDir, i18n.locale, fileName),
						contents: Buffer.from(compiled)
					}));
				} catch (e) {
					errors.push(e);
				}
			});
			if (errors.length)
				throw new Error(`Error at: ${file.path}\n${errors.map(e => e?.stack ?? e).join("\n")}`);
		} catch (e: any) {
			err = e ?? new Error('ERROR!');
		}
		cb(err);
	});
}

/** EJS compiler */
function _ejs(content: string, data: Record<string, any>) {
	return EJS.render(content, data);
}

/** Resolve i18n */
function _resolveI18n(globPattern: string, i18nVarName: string) {
	// Load i18n files
	var files = Glob.sync(globPattern);
	var len = files.length;
	if (len === 0) {
		throw new Error(`No file found for pattern: ${globPattern}`);
	}
	// Compile i18n files
	const i18nMap: Map<string, Record<string, any>> = new Map();
	for (let i = 0; i < len; ++i) {
		let filePath = files[i];
		let i18n = execModule(
			filePath,
			ts.transpile(readFileSync(filePath, 'utf-8'))
		).exports?.[i18nVarName];
		let locale = i18n?.locale;
		if (typeof locale !== 'string')
			throw new Error(
				`Missing "${i18nVarName}.locale" in file: ${filePath}`
			);
		if (i18nMap.has(locale))
			throw new Error(
				`Duplicate locale: ${locale}. Last found at: ${filePath}`
			);
		i18nMap.set(locale, i18n);
	}
	return i18nMap;
}
