import Gulp from 'gulp';
import { typescriptCompile, compileTestFiles } from './typescript.js';
const { watch, series, parallel } = Gulp;
const argv = process.argv;
const doWatch = argv.includes('--watch');
/** Watch modified files */
function watchCb(cb) {
    if (doWatch) {
        watch('src/**/*.ts', typescriptCompile);
        watch('test/**/*.ts', compileTestFiles);
        // watch('src/app/graphql/schema/**/*.gql', graphQlCompile)
    }
    cb();
}
export default series([
    parallel([
        typescriptCompile,
        compileTestFiles,
    ]),
    watchCb
]);
