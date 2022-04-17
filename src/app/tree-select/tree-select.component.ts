import { Component, OnInit, Injectable } from '@angular/core';
import { SelectionModel } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { BehaviorSubject, filter } from 'rxjs';
import { debounce, deepCopy, obj2str } from '../constants';
import { TigerGraphApiClientService } from '../tiger-graph-api.service';
import { SchemaOutput, TigerGraphEdgeType, TigerGraphVertexType, Str2Bool, Str2StrBool } from '../data-types';
import { SharedService } from '../shared.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettingsService } from '../settings.service';

/**
 * Node for to-do item
 */
export class TodoItemNode {
  children: TodoItemNode[];
  item: string;
}

/** Flat to-do item node with expandable and level information */
export class TodoItemFlatNode {
  item: string;
  level: number;
  expandable: boolean;
}

/**
 * Checklist database, it can build a tree structured Json object.
 * Each node in Json object represents a to-do item or a category.
 * If a node is a category, it has children items and new items can be added under the category.
 */
@Injectable({
  providedIn: 'root'
})
export class TreeSelectData {
  originalTreeData: any;
  dataChange = new BehaviorSubject<TodoItemNode[]>([]);
  readonly MAX_TREE_DEPTH = 2;

  get data(): TodoItemNode[] {
    return this.dataChange.value;
  }

  constructor() { }

  /** Should only be called once!
   * @param  {any} treeData
   */
  initialize(treeData: any) {
    this.originalTreeData = treeData;
    const data = this.buildFileTree(deepCopy(treeData), 0, '');

    // Notify the change.
    this.dataChange.next(data);
  }

  /**
   * Build the file structure tree. The `value` is the Json object, or a sub-tree of a Json object.
   * The return value is the list of `TodoItemNode`.
   */
  buildFileTree(obj: { [key: string]: any }, level: number, filterTxt: string): TodoItemNode[] {
    if (!obj) {
      return [];
    }

    return Object.keys(obj).reduce<TodoItemNode[]>((accumulator, key) => {
      const value = obj[key];
      const node = new TodoItemNode();
      node.item = key;

      if (value != null) {
        let strRepresentation = value;
        if (typeof value === 'object') {
          strRepresentation = key;
        }
        const hasTxt = strRepresentation.toLowerCase().includes(filterTxt);
        if (this.MAX_TREE_DEPTH == level && filterTxt.length > 0 && !hasTxt) {
          return accumulator;
        }
        if (typeof value === 'object') {
          node.children = this.buildFileTree(value, level + 1, filterTxt);
          if (node.children.length < 1 && filterTxt.length > 0 && !hasTxt) {
            return accumulator;
          }
        } else {
          node.item = value;
        }
      } else {
        return accumulator;
      }

      return accumulator.concat(node);
    }, []);
  }

  filterByTxt(txt: string) {
    txt = txt.toLocaleLowerCase();
    this.dataChange.next(this.buildFileTree(this.originalTreeData, 0, txt));
  }
}

@Component({
  selector: 'app-tree-select',
  templateUrl: './tree-select.component.html',
  styleUrls: ['./tree-select.component.css'],
  providers: [],
})
export class TreeSelectComponent {

  filterSchemaTxt: string = '';
  searchTxt: string = '';
  filterSchemaDebounced: Function;
  isDetailedSearchOpen = false;
  vertexPrimaryIds: Str2Bool = {};
  isCaseSense = true;
  isOnDB = true;
  vertexKey: string = '';
  edgeKey: string = '';

  /** Map from flat node to nested node. This helps us finding the nested node to be modified */
  flatNodeMap = new Map<TodoItemFlatNode, TodoItemNode>();

  /** Map from nested node to flattened node. This helps us to keep the same object for selection */
  nestedNodeMap = new Map<TodoItemNode, TodoItemFlatNode>();

  treeControl: FlatTreeControl<TodoItemFlatNode>;

  treeFlattener: MatTreeFlattener<TodoItemNode, TodoItemFlatNode>;

  dataSource: MatTreeFlatDataSource<TodoItemNode, TodoItemFlatNode>;

  /** The selection for checklist */
  checklistSelection = new SelectionModel<TodoItemFlatNode>(true /* multiple */);

  constructor(private _database: TreeSelectData, private _dbApi: TigerGraphApiClientService, private _s: SharedService, private _snackBar: MatSnackBar, private _settings: SettingsService) {
    this.treeFlattener = new MatTreeFlattener(
      this.transformer,
      this.getLevel,
      this.isExpandable,
      this.getChildren,
    );
    this.treeControl = new FlatTreeControl<TodoItemFlatNode>(this.getLevel, this.isExpandable);
    this.dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);

    this._database.dataChange.subscribe(data => {
      this.dataSource.data = data;
    });
    this.filterSchemaDebounced = debounce(this.onSearch, 250, false);
    this._s.onGetDbSchema.push(this.createFromSchema.bind(this));
  }

  private createFromSchema(x: SchemaOutput) {
    let tree = { 'Vertex': {}, 'Edge': {} };
    const cntEdgeType = x.results.EdgeTypes.length;
    const cntVertexType = x.results.VertexTypes.length;
    this.vertexPrimaryIds = {};
    this.parseSchemaData(tree, x.results.EdgeTypes, false);
    this.parseSchemaData(tree, x.results.VertexTypes, true);
    this.vertexKey = `Vertex (${cntVertexType})`;
    // rename vertex and edge
    tree[this.vertexKey] = tree['Vertex'];
    delete tree['Vertex'];

    this.edgeKey = `Edge (${cntEdgeType})`;
    tree[this.edgeKey] = tree['Edge'];
    delete tree['Edge'];
    this._database.initialize(tree);
  }

  private parseSchemaData(tree: any, typeArr: TigerGraphVertexType[] | TigerGraphEdgeType[], isVertex: boolean) {
    for (let i = 0; i < typeArr.length; i++) {
      const attr = [];
      const currType = typeArr[i].Name;
      if (isVertex) {
        const hasStrId = (typeArr[i] as TigerGraphVertexType).PrimaryId.AttributeType.Name == 'STRING';
        if (hasStrId) {
          // push primary id as string attribute 
          const attrName = (typeArr[i] as TigerGraphVertexType).PrimaryId.AttributeName;
          attr.push(attrName);
          this.vertexPrimaryIds[attrName] = true;
        }
      }

      // only parse string attributes
      const typeAttr = typeArr[i].Attributes.filter(x => x.AttributeType.Name == 'STRING');
      for (let j of typeAttr) {
        attr.push(j.AttributeName);
      }
      if (attr.length > 0) {
        if (isVertex) {
          tree.Vertex[`${currType} (${attr.length})`] = attr;
        } else {
          tree.Edge[`${currType} (${attr.length})`] = attr;
        }

      } else {
        if (isVertex) {
          tree.Vertex[currType] = attr;
        } else {
          // pass edge types without attributes since edges don't have ID (instead they have source id, target id and type)
          // tree.Edge[currType] = attr;
        }
      }
    }
  }

  changeTreeDepth() {
    this.onSearch();
  }

  getLevel = (node: TodoItemFlatNode) => node.level;

  isExpandable = (node: TodoItemFlatNode) => node.expandable;

  getChildren = (node: TodoItemNode): TodoItemNode[] => node.children;

  hasChild = (_: number, _nodeData: TodoItemFlatNode) => _nodeData.expandable;

  hasNoContent = (_: number, _nodeData: TodoItemFlatNode) => _nodeData.item === '';

  /**
   * Transformer to convert nested node to flat node. Record the nodes in maps for later use.
   */
  transformer = (node: TodoItemNode, level: number) => {
    const existingNode = this.nestedNodeMap.get(node);
    const flatNode =
      existingNode && existingNode.item === node.item ? existingNode : new TodoItemFlatNode();
    flatNode.item = node.item;
    flatNode.level = level;
    flatNode.expandable = !!node.children?.length;
    this.flatNodeMap.set(flatNode, node);
    this.nestedNodeMap.set(node, flatNode);
    return flatNode;
  };

  /** Whether all the descendants of the node are selected. */
  descendantsAllSelected(node: TodoItemFlatNode): boolean {
    const descendants = this.treeControl.getDescendants(node);
    const descAllSelected =
      descendants.length > 0 &&
      descendants.every(child => {
        return this.checklistSelection.isSelected(child);
      });
    return descAllSelected;
  }

  /** Whether part of the descendants are selected */
  descendantsPartiallySelected(node: TodoItemFlatNode): boolean {
    const descendants = this.treeControl.getDescendants(node);
    const result = descendants.some(child => this.checklistSelection.isSelected(child));
    return result && !this.descendantsAllSelected(node);
  }

  /** Toggle the to-do item selection. Select/deselect all the descendants node */
  todoItemSelectionToggle(node: TodoItemFlatNode): void {
    this.checklistSelection.toggle(node);
    const descendants = this.treeControl.getDescendants(node);
    this.checklistSelection.isSelected(node)
      ? this.checklistSelection.select(...descendants)
      : this.checklistSelection.deselect(...descendants);

    // Force update for the parent
    descendants.forEach(child => this.checklistSelection.isSelected(child));
    this.checkAllParentsSelection(node);
  }

  /** Toggle a leaf to-do item selection. Check all the parents to see if they changed */
  todoLeafItemSelectionToggle(node: TodoItemFlatNode): void {
    this.checklistSelection.toggle(node);
    this.checkAllParentsSelection(node);
  }

  /* Checks all the parents when a leaf node is selected/unselected */
  checkAllParentsSelection(node: TodoItemFlatNode): void {
    let parent: TodoItemFlatNode | null = this.getParentNode(node);
    while (parent) {
      this.checkRootNodeSelection(parent);
      parent = this.getParentNode(parent);
    }
  }

  /** Check root node checked state and change it accordingly */
  checkRootNodeSelection(node: TodoItemFlatNode): void {
    const nodeSelected = this.checklistSelection.isSelected(node);
    const descendants = this.treeControl.getDescendants(node);
    const descAllSelected =
      descendants.length > 0 &&
      descendants.every(child => {
        return this.checklistSelection.isSelected(child);
      });
    if (nodeSelected && !descAllSelected) {
      this.checklistSelection.deselect(node);
    } else if (!nodeSelected && descAllSelected) {
      this.checklistSelection.select(node);
    }
  }

  /* Get the parent node of a node */
  getParentNode(node: TodoItemFlatNode): TodoItemFlatNode | null {
    const currentLevel = this.getLevel(node);

    if (currentLevel < 1) {
      return null;
    }

    const startIndex = this.treeControl.dataNodes.indexOf(node) - 1;

    for (let i = startIndex; i >= 0; i--) {
      const currentNode = this.treeControl.dataNodes[i];

      if (this.getLevel(currentNode) < currentLevel) {
        return currentNode;
      }
    }
    return null;
  }

  onSearch() {
    this._database.filterByTxt(this.filterSchemaTxt);
    this.treeControl.expandAll();
    this.checklistSelection.clear();
  }

  search4text() {
    if (this.searchTxt.length < 1) {
      return;
    }
    if (this.isOnDB) {
      this.searchOnDB();
    } else {
      this.searchOnClient();
    }
  }

  searchOnClient() {
    const elems = this._s.cy.$();
    for (let i = 0; i < elems.length; i++) {
      const s = obj2str(elems[i].data());
      if (this._settings.appConf.isIgnoreCaseInText.getValue()) {
        if (s.toLowerCase().includes(this.searchTxt.toLowerCase())) {
          this._s.viewUtils.highlight(elems[i], this._settings.appConf.currHighlightIdx.getValue());
        }
      } else if (s.includes(this.searchTxt)) {
        this._s.viewUtils.highlight(elems[i], this._settings.appConf.currHighlightIdx.getValue());
      }
    }
  }

  searchOnDB() {
    const selected: TodoItemFlatNode[] = this.checklistSelection.selected;
    const graph = this._settings.appConf.tigerGraphDbConfig.graphName.getValue();
    let gsql = '';
    // search only for IDs in all Vertex types
    if (!selected || selected.length < 1) {
      const orExp = this.getGSQL4MultiOrExp(this.vertexPrimaryIds, this.searchTxt);
      gsql =
        `INTERPRET QUERY () FOR GRAPH ${graph} {
        nodes = SELECT x FROM :x WHERE ${orExp};
        PRINT nodes;
        }`;
    } else {
      const { vertexTypes, vertexAttr, edgeTypes, edgeAttr, } = this.getQuery4Selected();
      const vertexTypeSelector = `(${Object.keys(vertexTypes).join('|')})`;
      const edgeTypeSelector = `(${Object.keys(edgeTypes).join('|')})`;
      const vertexAttrOrExp = this.getGSQL4MultiOrExp(vertexAttr, this.searchTxt);
      const edgeAttrOrExp = this.getGSQL4MultiOrExp(edgeAttr, this.searchTxt);
      const hasVertex = vertexTypeSelector.length > 3;
      const hasEdge = edgeTypeSelector.length > 3;

      let printVertexStatement = ' nodes';
      if (hasEdge && hasVertex) {
        printVertexStatement = ', nodes';
      } else if (!hasVertex) {
        printVertexStatement = '';
      }

      gsql =
        `INTERPRET QUERY () FOR GRAPH ${graph} {
        ${hasEdge ? 'ListAccum<EDGE> @@edgeList;' : ''}
    
        ${hasVertex ? `nodes = SELECT x FROM ${vertexTypeSelector}:x WHERE ${vertexAttrOrExp};` : ''}
        
        ${hasEdge ? `srcNodes = SELECT s FROM :s -(${edgeTypeSelector}:x)- :t
                 WHERE ${edgeAttrOrExp}
                 ACCUM @@edgeList += x;` : ''}

        ${hasEdge ? `tgtNodes = SELECT t FROM :s -(${edgeTypeSelector}:x)- :t
                 WHERE ${edgeAttrOrExp};` : ''}
        
        PRINT ${hasEdge ? '@@edgeList, srcNodes, tgtNodes' : ''} ${printVertexStatement};
        }`;
    }
    this._dbApi.runQuery(gsql, (x) => {
      if (!x || !(x.results)) {
        this._snackBar.open('Empty response from query', 'x');
        return;
      }
      const r = x.results[0];
      const edges = r['@@edgeList'];
      if (r['@@edgeList']) {
        const nodes = r.tgtNodes.concat(r.srcNodes).concat(r.nodes);
        if (nodes.length < 1 && edges.length < 1) {
          this._snackBar.open('Empty response from query', 'x');
          return;
        }
        this._s.loadGraph({ nodes, edges });
      } else {
        if (r.nodes.length < 1) {
          this._snackBar.open('Empty response from query', 'x');
          return;
        }
        this._s.loadGraph({ nodes: r.nodes, edges: [] });
      }

      this._s.add2GraphHistory('run interpretted query');
    });
  }

  getGSQL4MultiOrExp(attribs: Str2Bool, txt: string): string {
    if (!this.isCaseSense) {
      txt = txt.toLowerCase();
    }
    const boolExpArr: string[] = [];
    const IDs = Object.keys(attribs);
    for (let i of IDs) {
      if (!this.isCaseSense) {
        boolExpArr.push(`LOWER(x.${i}) LIKE "%${txt}%"`);
      } else {
        boolExpArr.push(`x.${i} LIKE "%${txt}%"`);
      }
    }
    return boolExpArr.join(' OR ');
  }

  getQuery4Selected(): { vertexTypes: Str2Bool, vertexAttr: Str2Bool, edgeTypes: Str2Bool, edgeAttr: Str2Bool } {
    const selected: TodoItemFlatNode[] = this.checklistSelection.selected;

    const vertexTypes: Str2Bool = {};
    const vertexAttr: Str2Bool = {};
    const edgeTypes: Str2Bool = {};
    const edgeAttr: Str2Bool = {};

    let attributeItems = selected.filter(x => x.level == 2);
    for (let i of attributeItems) {
      const parent = this.getParentNode(i);
      const grandParent = this.getParentNode(parent);
      const typeName = parent.item.split('(')[0].trim();
      if (grandParent.item.startsWith('Vertex')) {
        vertexTypes[typeName] = true;
        vertexAttr[i.item] = true;
      } else {
        edgeTypes[typeName] = true;
        edgeAttr[i.item] = true;
      }
    }
    const typeItems = selected.filter(x => x.level == 1);
    for (let i of typeItems) {
      const parent = this.getParentNode(i);
      const typeName = i.item.split('(')[0].trim();
      if (parent.item.startsWith('Vertex')) {
        vertexTypes[typeName] = true;
        // add all attributes of a type
        const attribs = this._database.originalTreeData[this.vertexKey][i.item]
        for (const att of attribs) {
          vertexAttr[att] = true;
        }

      } else {
        edgeTypes[typeName] = true;
        // add all attributes of a type
        const attribs = this._database.originalTreeData[this.edgeKey][i.item]
        for (const att of attribs) {
          edgeAttr[att] = true;
        }
      }
    }
    return { vertexTypes, vertexAttr, edgeTypes, edgeAttr };
  }

  collapseTree() {
    this.treeControl.collapseAll();
  }

  expandTree() {
    this.treeControl.expandAll();
  }

  copyTypeName(txt: string) {
    txt = txt.split('(')[0].trim();
    this._snackBar.open(`'${txt}' copied!`, 'OK', {
      duration: 5000
    });
  }
}
