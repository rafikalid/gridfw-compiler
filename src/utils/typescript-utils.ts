import ts from "typescript";

/** Find child by kind */
export function findChildByKind(node: ts.Node, kind: ts.SyntaxKind): ts.Node|undefined{
	var queue: ts.Node[]= [node];
	var j= 0;
	while(j < queue.length){
		node= queue[j++];
		for(let i=0, childs= node.getChildren(), len= childs.length; i<len; ++i){
			let child= childs[i];
			if(child.kind===kind) return child;
			queue.push(child);
		}
	}
}