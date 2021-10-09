import ts from "typescript";

export function _importName(node: ts.Node, typeChecker: ts.TypeChecker): ImportName | undefined {
	var s = typeChecker.getSymbolAtLocation(node)?.declarations?.[0];
	if (s != null && ts.isImportSpecifier(s)) {
		let lib = s.parent.parent.parent.moduleSpecifier.getText().slice(1, -1);
		return {
			name: s.propertyName?.getText() ?? s.name.getText(),
			lib: lib,
			isGridfw: lib === 'gridfw',
			node: undefined
		}
	}
}

export interface ImportName {
	/** Import var name */
	name: string
	/** Lib name */
	lib: string
	/** is from gridfw */
	isGridfw: boolean
	/** Node: for more operations */
	node: ts.Node | undefined
}

// /** Get type name && check if is from Gridfw */
// export function getTypeInfo(type: ts.TypeNode, typeChecker: ts.TypeChecker): GetTypeInfoResp{
// 	var tp= typeChecker.getTypeAtLocation(type)?.symbol?.declarations?.[0];
// 	var name: ts.Identifier|undefined;
// 	if(tp!=null && (name= (tp as ts.InterfaceDeclaration).name)!=null){
// 		return {
// 			name:		name.getText(),
// 			isGridfw:	/[\/\\]node-modules[\/\\]gridfw[\/\\]/.test(tp.getSourceFile().fileName)
// 		}
// 	}
// 	return {
// 		name: undefined,
// 		isGridfw: false
// 	}
// }


// export interface GetTypeInfoResp{
// 	name?: string,
// 	isGridfw: boolean
// }