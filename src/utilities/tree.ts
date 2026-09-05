import { injectable } from 'tsyringe';

interface TreeNode {
  title: any;
  key: any;
  value: any;
  parent_id: any;
  level: any;
  url: any;
  children: TreeNode[];
  sort_order: any;
  is_leaf: boolean;
}

@injectable()
export class Tree {
  private buildTree(
    data: any[],
    level: number,
    root: string | number,
    idField: string,
    nameField: string,
  ): TreeNode[] {
    const result: TreeNode[] = [];
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

  getFunctionTree(data: any[], level: number, root: string): TreeNode[] {
    return this.buildTree(data, level, root, 'function_id', 'function_name');
  }
}
