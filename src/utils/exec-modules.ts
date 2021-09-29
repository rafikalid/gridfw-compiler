import { createRequire } from 'module';
import { dirname } from 'path';
import { runInContext, createContext } from 'vm';
/**
 * Exec commonjs modules
 */
export function execModule(filePath: string, content: string): Module {
	const module: Module = {
		require: createRequire(filePath),
		exports: {}
	};
	// Context
	const ctx = {
		module,
		exports: module.exports,
		require: module.require,
		__filename: filePath,
		__dirname: dirname(filePath)
	};
	runInContext(content, createContext(ctx), {
		filename: filePath,
		timeout: 1000
	});
	return module;
}

export interface Module {
	require: NodeRequire;
	exports: any;
}
