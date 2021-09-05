import ts from "typescript";

export function _importName(node: ts.Node, typeChecker: ts.TypeChecker): ImportName|undefined{
	var s= typeChecker.getSymbolAtLocation(node)?.declarations?.[0];
	if(s!=null && ts.isImportSpecifier(s)){
		let lib= s.parent.parent.parent.moduleSpecifier.getText().slice(1,-1);
		return {
			name:		s.propertyName?.getText() ?? s.name.getText(),
			lib:		lib,
			isGridfw:	lib==='gridfw'
		}
	}
}

export interface ImportName{
	/** Import var name */
	name:	string
	/** Lib name */
	lib:	string
	/** is from gridfw */
	isGridfw:	boolean
}