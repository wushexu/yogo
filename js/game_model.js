function GameModel() {
	this.realGame = true;
	this.boardSize = null;
	this.nodes = [];
	this.gameInfo = {};
	this.variationMap = {};
	this.nodeMap = {};
	this.nodesByMoveNumber = [];
	this.pointMovesMatrix = [];
	this.gameEndingNode = null;
}

GameModel.prototype = {

	indexNode : function(node){
		this.nodeMap[node.id] = node;
		if (node.status.move) {
			var realGame = node.belongingVariation.realGame;
			if (realGame) {
				var point=node.move.point;
				var pointMovesX=this.pointMovesMatrix[point.x];
				var pointMoves = pointMovesX[point.y];
				if (pointMoves) {
					pointMoves.push(node);
				} else {
					pointMoves = [ node ];
					pointMovesX[point.y] = pointMoves;
				}

				var mn = node.numbers.globalMoveNumber;
				this.nodesByMoveNumber[mn] = node;
			}
		}
	},

	traverseNodes : function(variationCallback, nodeCallback, context) {

		var nodes = this.nodes;
		for (var ni = 0; ni < nodes.length; ni++) {
			var node = nodes[ni];
			if (nodeCallback) {
				var ncr = nodeCallback.call(node, node, context);
				if (ncr === false) {
					return context;
				}
			}
			var variations = node.variations;
			if (!variations) {
				continue;
			}
			for (var vi = 0; vi < variations.length; vi++) {
				var variation = variations[vi];
				if (variationCallback) {
					var vcr = variationCallback.call(variation, variation,
							context);
					if (vcr === false) {
						return context;
					}
				}
				variation.traverseNodes(variationCallback, nodeCallback,
						context);
			}
		}

		return context;
	},

	selectNodes : function(predicate) {
		return this.traverseNodes(null, function(node, context) {
			if (predicate.call(node, node)) {
				context.push(node);
			}
		}, []);
	},

	findNode : function(predicate) {
		var result = this.traverseNodes(null, function(node, context) {
			var result = predicate.call(node, node);
			if (result === null) {
				return false;
			}
			if (result === true) {
				context.push(node);
				return false;
			}
		}, []);

		return result[0] || null;
	}
};

function Variation(baseNode, parentVariation) {
	this.baseNode = baseNode;
	this.parentVariation = parentVariation;
	this.realGame = false;
	this.nodes = [];
	this.index = 0;
	this.id = 'v' + yogo.nextuid();
}

Variation.prototype = {
	nextVariation : function() {
		var variations = this.baseNode.variations;
		var nextVindex = (this.index + 1) % variations.length;
		if (nextVindex == 0) {
			nextVindex = 1;
		}
		return variations[nextVindex];
	},
	
	previousVariation : function() {
		var variations = this.baseNode.variations;
		var nextVindex = (this.index - 1 + variations.length)
				% variations.length;
		if (nextVindex == 0) {
			nextVindex = variations.length - 1;
		}
		return variations[nextVindex];
	},
	
	realGameBaseNode : function() {
		var variation = this;
		while (variation && !variation.realGame) {
			if (variation.parentVariation.realGame) {
				return variation.baseNode;
			}
			variation = variation.parentVariation;
		}
	}

};

Variation.prototype.traverseNodes = GameModel.prototype.traverseNodes;
Variation.prototype.selectNodes = GameModel.prototype.selectNodes;
Variation.prototype.findNode = GameModel.prototype.findNode;

function Node(previousNode, belongingVariation) {
	this.previousNode = previousNode;
	this.belongingVariation = belongingVariation;
	this.nextNode = null;
	this.props = {};
	this.basic = {};
	this.move = {};
	this.status = {};
	this.id = 'n' + yogo.nextuid();
	this.position = null;
}

Node.prototype = {

	findNodeInAncestors : function(predicate) {
		var node = this;
		while (true) {
			node = node.previousNode;
			if (!node) {
				return null;
			}
			var result = predicate.call(node, node);
			if (result === null) {
				return null;
			}
			if (result === true) {
				return node;
			}
		}
	},

	findNodeInMainline : function(predicate) {
		var node = this;
		while (true) {
			if (node.nextNode) {
				node = node.nextNode;
			} else if (node.variations) {
				node = node.variations[0].nodes[0];
			} else {
				return null;
			}
			var result = predicate.call(node, node);
			if (result === null) {
				return null;
			}
			if (result === true) {
				return node;
			}
		}
	},

	findNodeInSuccessors : function(predicate) {
		var node = this;
		while (true) {
			if (node.nextNode) {
				node = node.nextNode;
			} else if (node.variations) {
				for (var vi = 0; vi < node.variations.length; vi++) {
					var variation = node.variations[vi];
					var foundNode = variation.findNode(predicate);
					if (foundNode) {
						return foundNode;
					}
				}
			} else {
				return null;
			}
			var result = predicate.call(node, node);
			if (result === null) {
				return null;
			}
			if (result === true) {
				return node;
			}
		}
	},

	nextNodeAt : function(coor) {
		var nextNode = this.nextNode;
		if (nextNode&&nextNode.move.point) {
			var point = nextNode.move.point;
			if (coor.x === point.x && coor.y === point.y) {
				return nextNode;
			}
			return null;
		}
		if (this.branchPoints) {
			for (var i = 0; i < this.branchPoints.length; i++) {
				var point = this.branchPoints[i];
				if (coor.x === point.x && coor.y === point.y) {
					var variation = this.variations[i];
					return variation.nodes[0];
				}
			}
		}
		return null;
	},

	newMoveColor : function() {
		var color;
		if(this.move['PL']){
			color=this.move['PL'];
		}else if(this.move.color){
			color=this.move.color;
			color=(color==='B')? 'W':'B';
		}else if(this.status.pass){
			var pn=this.previousNode;
			if(pn&&pn.move.color){
				color=this.move.color;
			}
		}
		if(!color){
			color='B';
		}
		return color;
	},

	setMoveNumber : function() {
		var realGame = this.belongingVariation.realGame;
		var lastMoveNode = this.previousNode;
		var mns;
		if (lastMoveNode) {
			var lastNumbers = lastMoveNode.numbers;
			if (this.status.move || this.status.pass) {
				mns = [ lastNumbers.globalMoveNumber + 1,
						lastNumbers.displayMoveNumber + 1,
						lastNumbers.variationMoveNumber + 1 ];
			} else {
				mns = [ lastNumbers.globalMoveNumber,
						lastNumbers.displayMoveNumber,
						lastNumbers.variationMoveNumber ];
			}
		} else {
			if (this.status.move || this.status.pass) {
				mns = [ 1, 1, 1 ];
			} else {
				mns = [ 0, 0, 0 ];
			}
		}
		this.numbers = {
			globalMoveNumber : mns[0],
			displayMoveNumber : mns[1],
			variationMoveNumber : mns[2]
		};
		if (this.status.variationFirstNode) {
			if (this.status.move || this.status.pass) {
				this.numbers.variationMoveNumber = 1;
				if (!realGame) {
					this.numbers.displayMoveNumber = 1;
				}
			} else {
				this.numbers.variationMoveNumber = 0;
				if (!realGame) {
					this.numbers.displayMoveNumber = 0;
				}
			}
		}
	},

	setBranchPoints : function() {
		if (!this.variations) {
			return;
		}
		var variations = this.variations;
		var branchPoints = [];
		for (var i = 0; i < variations.length; i++) {
			var variation = variations[i];
			var node0 = variation.nodes[0];
			if (node0.status.move) {
				var coordinate = node0.move.point;
				branchPoints.push(coordinate);
			}
		}
		this.branchPoints = branchPoints;
	}
};
