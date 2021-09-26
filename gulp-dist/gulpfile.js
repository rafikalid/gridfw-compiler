"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gulp_1 = __importDefault(require("gulp"));
const typescript_js_1 = require("./typescript.js");
// import { compileTest } from './test-files.js';
const { watch, series } = gulp_1.default;
const argv = process.argv;
const isProd = argv.includes('--prod');
const doWatch = argv.includes('--watch');
/** Watch modified files */
function watchCb(cb) {
    if (doWatch) {
        watch('src/**/*.ts', typescript_js_1.compileEsNext);
        // watch('src/app/graphql/schema/**/*.gql', graphQlCompile)
    }
    cb();
}
var tasks;
if (isProd) {
    tasks = [typescript_js_1.compileEsNext, typescript_js_1.compileCommonjs, watchCb];
}
else {
    tasks = [typescript_js_1.compileEsNext, watchCb];
}
exports.default = series(tasks);
