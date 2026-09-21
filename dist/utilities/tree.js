"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tree = void 0;
const tsyringe_1 = require("tsyringe");
let Tree = class Tree {
    buildTree(data, level, root, idField, nameField) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (data[i].level === level && data[i].parent_id === root) {
                const row = data[i];
                const children = this.buildTree(data, level + 1, row[idField], idField, nameField);
                result.push({
                    title: row[nameField],
                    key: row[idField],
                    value: row[idField],
                    parent_id: row.parent_id,
                    level: row.level,
                    url: row.url,
                    children,
                    sort_order: row.sort_order,
                    is_leaf: children.length === 0,
                });
            }
        }
        return result;
    }
    getFunctionTree(data, level, root) {
        return this.buildTree(data, level, root, 'function_id', 'function_name');
    }
};
exports.Tree = Tree;
exports.Tree = Tree = __decorate([
    (0, tsyringe_1.injectable)()
], Tree);
