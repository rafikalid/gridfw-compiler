"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileCommonjs = exports.compileEsNext = void 0;
/**
 * Compile Typescript files
 */
const gulp_1 = __importDefault(require("gulp"));
const gulp_typescript_1 = __importDefault(require("gulp-typescript"));
const gulp_sourcemaps_1 = __importDefault(require("gulp-sourcemaps"));
const typescript_path_fix_1 = require("typescript-path-fix");
const gulp_rename_1 = __importDefault(require("gulp-rename"));
const { src, dest, lastRun } = gulp_1.default;
// import {transform} from 'ts-transform-import-path-rewrite'
const isProd = process.argv.includes('--prod');
const tsPathFix = new typescript_path_fix_1.Converter('tsconfig.json');
const TsProject = gulp_typescript_1.default.createProject('tsconfig.json', {
    removeComments: isProd,
    pretty: !isProd,
    target: 'ESNext',
    module: 'ESNext'
});
const TsProjectCommonjs = gulp_typescript_1.default.createProject('tsconfig.json', {
    removeComments: isProd,
    pretty: !isProd,
    target: 'ES2015',
    module: 'CommonJS'
});
/** Compile as EsNext */
function compileEsNext() {
    return src('src/**/*.ts', {
        nodir: true,
        since: lastRun(compileEsNext)
    })
        .pipe(gulp_sourcemaps_1.default.init())
        .pipe(TsProject())
        .pipe(tsPathFix.gulp('.mjs'))
        .pipe(gulp_rename_1.default({ extname: '.mjs' }))
        .pipe(gulp_sourcemaps_1.default.write('.'))
        .pipe(dest('dist/module'));
}
exports.compileEsNext = compileEsNext;
/** Compile as Commonjs */
function compileCommonjs() {
    return src('src/**/*.ts', {
        nodir: true,
        since: lastRun(compileCommonjs)
    })
        .pipe(gulp_sourcemaps_1.default.init())
        .pipe(tsPathFix.gulp())
        .pipe(TsProjectCommonjs())
        .pipe(gulp_sourcemaps_1.default.write('.'))
        .pipe(dest('dist/commonjs'));
}
exports.compileCommonjs = compileCommonjs;
