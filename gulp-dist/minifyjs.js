"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.minifyJs = void 0;
/** Wrapper for Terser */
const uglify_js_1 = require("uglify-js");
const through2_1 = __importDefault(require("through2"));
function minifyJs() {
    return through2_1.default.obj(function (file, _, cb) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            var err = null;
            try {
                const p = file.path;
                let c, c2;
                let ext;
                if (file.isBuffer() === false ||
                    (c = p.lastIndexOf('.')) === -1 ||
                    ((c2 = p.lastIndexOf('.', c - 1)) !== -1 && p.substr(c2, 2) === '.d')) { }
                else if ((ext = p.substr(c)) === '.js' ||
                    ext === '.mjs' ||
                    ext === '.cjs') {
                    const res = (yield (0, uglify_js_1.minify)(file.contents.toString()));
                    if (res.code == null)
                        throw res.error;
                    file.contents = Buffer.from(res.code);
                }
            }
            catch (e) {
                err = new Error(`Minify failed: ${file.path}.\nCaused by:${(_a = e === null || e === void 0 ? void 0 : e.stack) !== null && _a !== void 0 ? _a : e}\n`);
            }
            cb(err, file);
        });
    });
}
exports.minifyJs = minifyJs;
