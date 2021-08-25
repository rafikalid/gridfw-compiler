import ts from "typescript";
import type Vinyl from 'vinyl';

/** Compile controllers */
export function compileControllers(program: ts.Program, sourceFile: ts.SourceFile, files: Map<string, Vinyl>): ts.SourceFile {
	// Check if file has a target pattern
	var patterns= _getPattern(sourceFile);
	if(patterns.size===0) return sourceFile;
	//TODO compile patterns
	return sourceFile;
}

/** Get Controller load patterns from source file */
function _getPattern(sourceFile: ts.SourceFile) {
	const patterns: Set<string>= new Set();
	const queue:ts.Node[]= [sourceFile];
	var node, j=0;
	while(j<queue.length){
		node= queue[j++];
		if(
			ts.isCallExpression(node)
			&& ts.isPropertyAccessExpression(node.expression)
			&& node.typeArguments?.length===1
			&& node?.typeArguments[0].kind===ts.SyntaxKind.StringLiteral
		){
			console.log('--- Found node: ', node.getText());
			// TODO check variable type and add pattern
		} else if(node.getChildCount()>0){
			queue.push(...node.getChildren());
		}
	}
	return patterns;
}

