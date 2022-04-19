import { Injectable } from '@angular/core';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import expandCollapse from 'cytoscape-expand-collapse';
import contextMenus from 'cytoscape-context-menus';
import viewUtilities from 'cytoscape-view-utilities';

import { Layout, LAYOUT_ANIM_DUR, expandCollapseCuePosition, EXPAND_COLLAPSE_CUE_SIZE, debounce, MAX_HIGHLIGHT_CNT, deepCopy, COLLAPSED_EDGE_CLASS, COMPOUND_CLASS, COLLAPSED_NODE_CLASS, OBJ_INFO_UPDATE_DELAY, isPrimitiveType, getCyStyleFromColorAndWid, EXPAND_COLLAPSE_FAST_OPT } from './constants';
import { GraphResponse, NodeResponse, InterprettedQueryResult, TableData, isNodeResponse, isEdgeResponse, EdgeResponse, GraphHistoryItem, SchemaOutput } from './data-types';
import { Subject, BehaviorSubject } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ErrorDialogComponent } from './error-dialog/error-dialog.component';
import { GENERAL_CY_STYLE } from './config/general-cy-style';
import { TigerGraphApiClientService } from './tiger-graph-api.service';
import { SettingsService } from './settings.service';
import { InputNumberDialogComponent } from './input-number-dialog/input-number-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root'
})
export class SharedService {
  cy: any;
  expandCollapseApi: any;
  performLayout: Function;
  isRandomizedLayout: boolean = true;
  viewUtils: any;
  isLoading: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  elemSelectChanged: Subject<boolean> = new Subject();
  showTableChanged: Subject<boolean> = new Subject();
  graphChanged: Subject<boolean> = new Subject();
  elemHoverChanged: Subject<any> = new Subject();
  tableData: Subject<TableData> = new Subject();
  elems2highlight = null;
  graphHistory: GraphHistoryItem[] = [];
  addNewGraphHistoryItem = new BehaviorSubject<boolean>(false);
  readonly CROWDED_NEI_LIMIT = 5;
  metaEdge2edge = {};
  currentHistoryIdx = 0;
  showCertainPropsInTable: any = false;
  onGetDbSchema: Function[] = [];
  contextMenusAPI = null;

  constructor(public dialog: MatDialog, private _dbApi: TigerGraphApiClientService, private _conf: SettingsService, private _snackBar: MatSnackBar) {
    let isGraphEmpty = () => { return this.cy.elements().not(':hidden, :transparent').length > 0 };
    this.performLayout = debounce(this.runLayout, LAYOUT_ANIM_DUR, true, isGraphEmpty);
    this._dbApi.onErrFn = () => { this.isLoading.next(false) };
  }

  init() {
    this.cy = cytoscape({
      // so we can see the ids
      style: GENERAL_CY_STYLE,
      container: document.getElementById('cy'),
      wheelSensitivity: 0.1,
    });
    window['cy'] = this.cy;

    cytoscape.use(fcose);
    cytoscape.use(contextMenus);

    //register expand-collapse extension
    expandCollapse(cytoscape);
    this.bindExpandCollapseExt();
    this.bindContextMenus();

    // register view utilities extension
    viewUtilities(cytoscape);
    this.bindViewUtilitiesExtension();

    const fn = debounce((e) => { this.elemSelectChanged.next(e.type === 'select'); }, OBJ_INFO_UPDATE_DELAY);
    this.cy.on('select unselect', fn);
    const fn2 = debounce(() => { this.graphChanged.next(true) }, OBJ_INFO_UPDATE_DELAY);
    this.cy.on('add remove', fn2);
    const fn3 = debounce((e) => {
      this.elemHoverChanged.next(e);
      const t = e.target;
      t.removeClass('hovered');
      if (e.type == 'mouseover') {
        t.addClass('hovered');
      }
    }, OBJ_INFO_UPDATE_DELAY);
    this.cy.on('mouseover mouseout', 'node, edge', fn3);
    // this.cy.on('mouseover mouseout', 'node, edge', this.magnifyOnHover().bind(this));

    this.bindComponentSelector();
    this.addFnStyles();
    this.onGetDbSchema.push(this.addContexMenus4DbSchema.bind(this));
    this._conf.appConf.tigerGraphDbConfig.isConnected.subscribe(x => {
      if (!x) {
        return;
      }
      this._dbApi.getGraphSchema((x: SchemaOutput) => {
        for (let i = 0; i < this.onGetDbSchema.length; i++) {
          this.onGetDbSchema[i](x);
        }
      });
    })
  }

  private addContexMenus4DbSchema(x: SchemaOutput) {
    let undirectedEdges = {}; // 2-level dictionary
    for (let eType of x.results.EdgeTypes) {
      if (!undirectedEdges[eType.FromVertexTypeName]) {
        undirectedEdges[eType.FromVertexTypeName] = {};
      }
      undirectedEdges[eType.FromVertexTypeName][eType.ToVertexTypeName] = true;

      if (!undirectedEdges[eType.ToVertexTypeName]) {
        undirectedEdges[eType.ToVertexTypeName] = {};
      }
      undirectedEdges[eType.ToVertexTypeName][eType.FromVertexTypeName] = true;
    }
    let items = [];
    for (let i in undirectedEdges) {
      let submenu = [];
      for (let j in undirectedEdges[i]) {
        submenu.push({
          id: `neighborsOf${i}4type${j}`,
          content: j,
          onClickFunction: (e) => { this.getNeighbors(e, j); },
        })
      }
      items.push({
        id: `neighborsOf${i}4type`,
        content: `Get neigbors for type`,
        submenu: submenu,
        selector: `node.${i}`,
      });
    }
    this.contextMenusAPI.appendMenuItems(items);
  }

  private magnifyOnHover() {
    const ANIM_DUR = 50;
    let id2Anim = {};
    let timeout;
    let prevEnteredId = null;


    return function (event) {
      const tgt = event.target;
      const isEdge = tgt.isEdge();
      const isOn = event.type === 'mouseover';
      const currId = tgt.id();

      if (isOn && !prevEnteredId) {
        prevEnteredId = currId;
      }
      if (!isOn && prevEnteredId == currId) {
        clearTimeout(timeout);
        prevEnteredId = null;

      }
      if (!isOn && id2Anim[currId]) {
        id2Anim[currId].reverse().play();
        id2Anim[currId] = undefined;
      }

      timeout = setTimeout(() => {
        const nodeAnim = {
          style: {
            'z-index': 15
          }, duration: ANIM_DUR
        };
        const edgeAnim = {
          style: {
            'z-index': 15
          }, duration: ANIM_DUR
        };
        if (!isOn) {
          return;
        }
        if (isEdge) {
          id2Anim[currId] = tgt.animation(edgeAnim);
        } else {
          id2Anim[currId] = tgt.animation(nodeAnim);
        }
        id2Anim[currId].play();
      }, ANIM_DUR);
    }
  }

  private runLayout(algoName: string | null = null): void {
    const elems4layout = this.cy.elements().not(':hidden, :transparent');
    if (elems4layout.length < 1) {
      return;
    }
    if (!algoName) {
      algoName = this._conf.appConf.currLayout.getValue();
    }
    const l = Layout[algoName];
    if (!l) {
      console.log('undefined layout')
    }

    if (l.randomize !== undefined) {
      l.randomize = this.isRandomizedLayout;
    }

    elems4layout.layout(l).run();
  }

  private bindExpandCollapseExt() {
    const layout = deepCopy(Layout.fcose);
    layout.randomize = false;
    this.expandCollapseApi = this.cy.expandCollapse({
      layoutBy: layout,
      // recommended usage: use cose-bilkent layout with randomize: false to preserve mental map upon expand/collapse
      fisheye: false, // whether to perform fisheye view after expand/collapse you can specify a function too
      animate: true, // whether to animate on drawing changes you can specify a function too
      ready: function () { }, // callback when expand/collapse initialized
      undoable: false, // and if undoRedoExtension exists,
      randomize: false,

      cueEnabled: true, // Whether cues are enabled
      expandCollapseCuePosition: expandCollapseCuePosition,
      expandCollapseCueSize: EXPAND_COLLAPSE_CUE_SIZE, // size of expand-collapse cue
      expandCollapseCueLineSize: 8, // size of lines used for drawing plus-minus icons
      expandCueImage: undefined, // image of expand icon if undefined draw regular expand cue
      collapseCueImage: undefined, // image of collapse icon if undefined draw regular collapse cue
      expandCollapseCueSensitivity: 1, // sensitivity of expand-collapse cues
      allowNestedEdgeCollapse: false
    });
  }

  bindViewUtilitiesExtension() {
    let options = {
      highlightStyles: this.getHighlightStyles(),
      setVisibilityOnHide: false, // whether to set visibility on hide/show
      setDisplayOnHide: true, // whether to set display on hide/show
      zoomAnimationDuration: 1500, //default duration for zoom animation speed
      neighbor: function (node) { // return desired neighbors of tapheld node
        return false;
      },
      neighborSelectTime: 500, //ms, time to taphold to select desired neighbors,
      colorCount: MAX_HIGHLIGHT_CNT
    };
    this.viewUtils = this.cy.viewUtilities(options);
  }

  private bindComponentSelector() {
    let isSelectionLocked: boolean = false;

    this.cy.on('taphold', 'node', (e) => {
      if (!e.originalEvent.shiftKey) {
        return;
      }
      e.target.component().select();
      // it selects current node again to prevent that, disable selection until next tap event
      this.cy.autounselectify(true);
      isSelectionLocked = true;
    });

    this.cy.on('free', 'node', () => {
      if (!isSelectionLocked) {
        return;
      }
      // wait to prevent unselect clicked node, after tapend 
      setTimeout(() => {
        this.cy.autounselectify(false);
        isSelectionLocked = false;
      }, 100);
    });
  }

  private bindContextMenus() {
    const options = {
      // Customize event to bring up the context menu
      // Possible options https://js.cytoscape.org/#events/user-input-device-events
      evtType: 'cxttap',
      // List of initial menu items
      // A menu item must have either onClickFunction or submenu or both
      menuItems: [{
        id: 'removeHighlights',
        content: 'Remove Highlights',
        coreAsWell: true,
        onClickFunction: () => { this.viewUtils.removeHighlights(); }
      },
      {
        id: 'performLayout',
        content: 'Incremental Layout',
        coreAsWell: true,
        onClickFunction: () => { this.isRandomizedLayout = false; this.performLayout(); }
      },
      {
        id: 'recalculateLayout',
        content: 'Recalculate Layout',
        coreAsWell: true,
        onClickFunction: () => { this.isRandomizedLayout = true; this.performLayout(); }
      },
      {
        id: 'deleteSelected',
        content: 'Delete Selected',
        coreAsWell: true,
        onClickFunction: (x) => { this.deleteSelected(null) }
      },
      {
        id: 'selectObjectsOfThisType',
        content: 'Select Objects of This Type',
        selector: 'node,edge',
        onClickFunction: this.selectAllThisType.bind(this)
      },
      {
        id: 'collapseEdge',
        content: 'Collapse',
        selector: 'edge',
        onClickFunction: (e) => {
          const ele = e.target || e.cyTarget;
          if (!ele) {
            return;
          }
          this.collapseCompoundEdges(ele.parallelEdges());
        }
      },
      {
        id: 'expandEdge',
        content: 'Expand',
        selector: 'edge.' + COLLAPSED_EDGE_CLASS,
        onClickFunction: (e) => { this.expandCompoundEdges(e.target || e.cyTarget); }
      },
      {
        id: 'removeGroup',
        content: 'Remove Group',
        selector: 'node.' + COMPOUND_CLASS,
        onClickFunction: (e) => { this.removeCompound4Selected(e.target || e.cyTarget) }
      },
      {
        id: 'deleteElement',
        content: 'Delete',
        selector: 'node,edge',
        onClickFunction: this.deleteSelected.bind(this)
      },
      {
        id: 'inchi4visible',
        content: 'Get inchi similarity',
        selector: 'node.Compound',
        onClickFunction: this.getInchiSimilarity2Existing.bind(this)
      },
      {
        id: 'adamicAdar4visible',
        content: 'Get Adamic–Adar index',
        selector: 'node',
        onClickFunction: this.getAdamicAdar2Existing.bind(this)
      },
      {
        id: 'jaccardSimilarity',
        content: 'Get Jaccard similarity',
        selector: 'node',
        onClickFunction: this.getJaccardSimilarity.bind(this)
      },
      {
        id: 'getElemData',
        content: 'Get attributes',
        selector: 'node',
        onClickFunction: this.getAttributes.bind(this)
      },
      {
        id: 'getneighbors',
        content: 'Get all neighbors',
        selector: 'node',
        onClickFunction: (e) => { this.getNeighbors(e, ''); },
      },
      ],
      menuItemClasses: ['mat-menu-item', 'ctx-menu-item'],
      contextMenuClasses: ['mat-menu-content', 'ctx-menu-container'],
      submenuIndicator: {
        src: 'assets/icons/arrow_right.svg',
        width: 24,
        height: 24,
      },
    };
    this.contextMenusAPI = this.cy.contextMenus(options);
    this.cy.pan(this.cy.pan());
  }

  getHighlightStyles(): any[] {
    let r: any[] = [];

    for (let i = 0; i < this._conf.appConf.highlightStyles.length; i++) {
      let style = this._conf.appConf.highlightStyles[i];
      let w = style.wid.getValue();
      let c = style.color.getValue();

      const styles = getCyStyleFromColorAndWid(c, w);
      r.push({ node: styles.nodeCss, edge: styles.edgeCss });
    }
    return r;
  }

  private getInchiSimilarity2Existing(e) {
    const ele = e.target || e.cyTarget;
    if (!ele) {
      return;
    }
    this.isLoading.next(true);
    const fn = (x) => {
      this.isLoading.next(false);
      const distArr = x.nodes[0]['@@distances'];
      let elems = this.cy.collection();
      for (let i = 0; i < distArr.length; i++) {
        const elem = this.cy.$id('n_' + distArr[i].v);
        elem.data('inchi_similarity', distArr[i].score);
        elems = elems.union(elem);
      }
      elems.select();
      this.showCertainPropsInTable = { id: true, inchi_similarity: true };
      setTimeout(() => {
        this.showCertainPropsInTable = false;
      }, 1000);
    };
    const toDbId = (x: string) => { return x.split('_')[1]; };
    const compoundIds = this.cy.nodes('.Compound').not('#' + ele.id()).map((x) => { return { l: toDbId(x.id()) } });
    const params = [{ topN: 100 }, { v: toDbId(ele.id()) }, ...compoundIds];
    this._dbApi.runStoredProcedure(fn, 'inchiSimilarity', params);
  }

  private getAdamicAdar2Existing(e) {
    const ele = e.target || e.cyTarget;
    if (!ele) {
      return;
    }
    this.isLoading.next(true);
    const fn = (x) => {
      this.isLoading.next(false);
      if (!x.nodes[0]) {
        return;
      }
      const dists = x.nodes[0]['@@sum_closeness'];
      let elems = this.cy.collection();
      for (let k in dists) {
        const elem = this.cy.$id('n_' + k);
        elem.data('adamic_adar', dists[k]);
        elems = elems.union(elem);
      }
      elems.select();
      this.showCertainPropsInTable = { id: true, adamic_adar: true };
      setTimeout(() => {
        this.showCertainPropsInTable = false;
      }, 1000);
    };
    const toDbId = (x: string) => { return x.split('_')[1]; };
    const targetIds = this.cy.nodes().not('#' + ele.id()).map((x, i) => {
      const k = `targets[${i}]`;
      const o = {};
      o[k] = toDbId(x.id());
      return o
    });
    const targetTypes = this.cy.nodes().not('#' + ele.id()).map((x, i) => {
      const k = `targets[${i}].type`;
      const o = {};
      o[k] = x.classes()[0];
      return o
    });
    const params = [{ source: toDbId(ele.id()) }, { 'source.type': ele.classes()[0] }, ...targetIds, ...targetTypes];
    this._dbApi.runStoredProcedure(fn, 'adamicAdar', params);
  }

  // compute jaccard similarity between selected node and all the others from the same type
  private getJaccardSimilarity(e) {
    const ele = e.target || e.cyTarget;
    if (!ele) {
      return;
    }
    const dialogRef = this.dialog.open(InputNumberDialogComponent, {
      width: '250px',
      data: { prompt: "For how many nodes?", num: 100 },
    });

    dialogRef.afterClosed().subscribe((result: number) => {
      if (result === undefined) {
        return;
      }
      this.isLoading.next(true);
      const fn = (x) => {
        this.isLoading.next(false);
        const nodeData = x.nodes[0].results;
        const scoreAttrib = 'results.@score';
        for (let i = 0; i < nodeData.length; i++) {
          const v = nodeData[i]['attributes'][scoreAttrib];
          delete nodeData[i]['attributes'][scoreAttrib];
          nodeData[i]['attributes']['jaccard_similarity'] = v;
        }
        this.loadGraph({ edges: [], nodes: nodeData });
        this.cy.$().unselect();
        const loadedIds = nodeData.map(x => 'n_' + x.v_id);
        for (let id of loadedIds) {
          this.cy.$id(id).select();
        }
        console.log(x);
      };
      const toDbId = (x: string) => { return x.split('_')[1]; };
      const t = ele.classes()[0];
      const params = [{ source: toDbId(ele.id()) }, { vertexType: t }, { top_k: Number(result) }, { 'source.type': t }];
      this._dbApi.runStoredProcedure(fn, 'jaccardSimilarity', params);
    });

  }

  private getAttributes(e) {
    const ele = e.target || e.cyTarget;
    if (!ele) {
      return;
    }
    const dbId = ele.id().split('_')[1];
    const graph = this._conf.appConf.tigerGraphDbConfig.graphName.getValue();
    const gsql = `INTERPRET QUERY () FOR GRAPH ${graph} {   
      start =   {ANY};
      results = SELECT s FROM start:s WHERE s.Id == "${dbId}";
      PRINT results;
  }`
    this._dbApi.runQuery(gsql, (x) => {
      if (!x || !(x.results)) {
        this._snackBar.open('Empty response from query: ' + JSON.stringify(x), 'x');
        return;
      }
      this.loadGraph({ nodes: x.results[0].results, edges: [] });
      this.cy.$().unselect();
      ele.select();
    });
  }

  private getInchiSimilarity2All(e) {
    const ele = e.target || e.cyTarget;
    if (!ele) {
      return;
    }
    this.isLoading.next(true);
    const fn = (x) => {
      this.isLoading.next(false);
      const distArr = x.nodes[0]['@@distances'];
      setTimeout(() => {
        this.tableData.next({ columns: ["id", "score"], data: distArr });
      }, 0);
    };
    const toDbId = (x: string) => { return x.split('_')[1]; };
    const params = [{ topN: 10 }, { v: toDbId(ele.id()) }];
    this._dbApi.runStoredProcedure(fn, 'inchiSimilarity', params);
  }

  getNeighbors(e, otherNodeType: string) {
    const ele = e.target || e.cyTarget;
    if (!ele) {
      return;
    }
    this.isLoading.next(true);
    const fn = (x) => {
      this.loadGraph(x);
      this.add2GraphHistory('get neighbors of node');
    };
    this._dbApi.getNeighborsOfNode(fn, ele, otherNodeType);
  }

  selectAllThisType(event) {
    const ele = event.target || event.cyTarget;
    if (!ele) {
      return;
    }
    const c = ele.classes()[0];
    this.cy.$('.' + c).select();
  }

  isWarn4Collapsed(elems): boolean {
    let hasAnyCollapsed = elems.nodes('.' + COLLAPSED_NODE_CLASS).length > 0 || elems.edges('.' + COLLAPSED_EDGE_CLASS).length > 0;
    if (hasAnyCollapsed) {
      const dialogRef = this.dialog.open(ErrorDialogComponent);
      dialogRef.componentInstance.title = 'Save Error';
      dialogRef.componentInstance.content = 'Can not save since there are collapsed nodes or edges. Since they contain cyclic references, they can not be saved as JSON. Please expand all then try saving';
      return true;
    }
    return false;
  }

  addCompound4Selected() {
    const elems = this.cy.nodes(':selected');
    if (elems.length < 1) {
      return;
    }
    const parent = elems[0].parent().id();
    for (let i = 1; i < elems.length; i++) {
      if (parent !== elems[i].parent().id()) {
        return;
      }
    }
    const id = new Date().getTime();
    this.addParentNode(id, parent);
    for (let i = 0; i < elems.length; i++) {
      elems[i].move({ parent: 'c' + id });
    }
    this.isRandomizedLayout = false;
    this.performLayout();
  }

  removeCompound4Selected(elems = null) {
    if (!elems) {
      elems = this.cy.nodes(':selected').filter('.' + COMPOUND_CLASS);
    }
    if (elems.length < 1) {
      return;
    }
    for (let i = 0; i < elems.length; i++) {
      // expand if collapsed
      if (elems[i].hasClass(COLLAPSED_NODE_CLASS)) {
        this.expandCollapseApi.expand(elems[i], { layoutBy: null, fisheye: false, animate: false });
      }
      const grandParent = elems[i].parent().id() ?? null;
      const children = elems[i].children();
      children.move({ parent: grandParent });
      this.cy.remove(elems[i]);
    }
    this.isRandomizedLayout = false;
    this.performLayout();
  }

  removeCompoundNodes() {
    this.removeCompound4Selected(this.cy.nodes('.' + COMPOUND_CLASS));
  }

  collapseCompoundNodes() {
    if (this.cy.nodes(':parent').length > 0) {
      this.expandCollapseApi.collapseAll();
    }
  }

  collapseCompoundEdges(edges2collapse?: any) {
    if (!edges2collapse) {
      edges2collapse = this.cy.edges(':visible');
    } else {
      this.expandCollapseApi.collapseEdges(edges2collapse);
      return;
    }
    edges2collapse = edges2collapse.filter('[^originalEnds]'); // do not collapse meta-edges
    let sourceTargetPairs = {};
    // let isCollapseBasedOnType = false;
    let edgeCollapseLimit = 1;
    for (let i = 0; i < edges2collapse.length; i++) {
      let e = edges2collapse[i];
      const s = e.data('source');
      const t = e.data('target');
      let edgeId = s + t;
      // if (isCollapseBasedOnType) {
      //   edgeId = e.classes()[0] + s + t;
      // }
      if (!sourceTargetPairs[edgeId]) {
        sourceTargetPairs[edgeId] = { cnt: 1, s: s, t: t };
      } else {
        sourceTargetPairs[edgeId]['cnt'] += 1;
      }
    }
    for (let i in sourceTargetPairs) {
      let curr = sourceTargetPairs[i];
      if (curr.cnt < edgeCollapseLimit) {
        continue;
      }
      let edges = this.cy.edges(`[source="${curr.s}"][target="${curr.t}"]`);
      this.expandCollapseApi.collapseEdges(edges);
    }
  }

  expandCompoundNodes() {
    if (this.cy.nodes('.' + COLLAPSED_NODE_CLASS).length > 0) {
      this.expandCollapseApi.expandAll();
    }
  }

  expandCompoundEdges(edges2expand?: any) {
    if (!edges2expand) {
      edges2expand = this.cy.edges('.' + COLLAPSED_EDGE_CLASS);
    }
    this.expandCollapseApi.expandEdges(edges2expand);
  }

  deleteSelected(event = null) {
    this.add2GraphHistory('delete selected', true);
    if (event) {
      const ele = event.target || event.cyTarget;
      if (ele) {
        this.cy.remove(ele);
      }
    } else {
      this.cy.remove(':selected');
    }
  }

  deleteUnselected() {
    this.add2GraphHistory('delete unselected', true);
    this.cy.remove(':unselected');
  }

  hideSelected() {
    this.viewUtils.hide(this.cy.$(':selected'));
  }

  hideUnselected() {
    this.viewUtils.hide(this.cy.$(':unselected'));
  }

  showAll() {
    this.viewUtils.show(this.cy.$());
  }

  loadGraph(resp: GraphResponse) {
    if (!resp) {
      console.log('error in graph response: ', resp);
      return;
    }
    const currHiglightIdx = this._conf.appConf.currHighlightIdx.getValue();
    this.viewUtils.removeHighlights();
    this.isRandomizedLayout = this.cy.$().length < 1;
    let isAddedNew = false;
    const node_ids = {};
    // add nodes
    for (const node of resp.nodes) {
      if (!node) {
        continue;
      }
      node.attributes.id = 'n_' + node.v_id;
      const cyNode = this.cy.$id(node.attributes.id);
      if (cyNode.length > 0) {
        cyNode.data(node.attributes);
        this.viewUtils.highlight(cyNode, currHiglightIdx);
        continue;
      }
      node_ids[node.v_id] = true;
      const newNode = this.cy.add({ data: node.attributes, classes: node.v_type });
      if (!this.isRandomizedLayout) {
        this.viewUtils.highlight(newNode, currHiglightIdx);
      }
      isAddedNew = true;
    }

    for (const edge of resp.edges) {
      const fromId = 'n_' + edge.from_id;
      const toId = 'n_' + edge.to_id;
      edge.attributes.source = fromId;
      edge.attributes.target = toId;
      edge.attributes.id = 'e_' + fromId + '-' + toId;
      const cyEdge = this.cy.$id(edge.attributes.id);
      if (cyEdge.length > 0) {
        cyEdge.data(edge.attributes);
        this.viewUtils.highlight(cyEdge, currHiglightIdx);
        continue;
      }
      if (this.cy.$id(fromId).length < 1 || this.cy.$id(toId).length < 1) {
        continue;
      }
      const newEdge = this.cy.add({ data: edge.attributes, classes: edge.e_type });
      if (!this.isRandomizedLayout) {
        this.viewUtils.highlight(newEdge, currHiglightIdx);
      }
      isAddedNew = true;
    }

    this.isLoading.next(false);
    if (isAddedNew) {
      this.performLayout();
    }
  }

  groupCrowdedNei() {
    const src2tgt = {}; // src to edge type to tgt array
    const tgt2src = {}; // tgt to edge type to src array
    const edges = this.cy.edges(':visible');
    for (let i = 0; i < edges.length; i++) {
      const src = edges[i].source().id();
      const tgt = edges[i].target().id();
      // skip loops
      if (src == tgt) {
        continue;
      }
      // skip those who have parents
      if (this.cy.$id(src).parent().length > 0 || this.cy.$id(tgt).parent().length > 0) {
        continue;
      }
      if (!src2tgt[src]) {
        src2tgt[src] = {};
      }
      if (!tgt2src[tgt]) {
        tgt2src[tgt] = {};
      }
      const edgeType = edges[i].classes()[0];
      if (!src2tgt[src][edgeType]) {
        src2tgt[src][edgeType] = [];
      }
      if (!tgt2src[tgt][edgeType]) {
        tgt2src[tgt][edgeType] = [];
      }
      src2tgt[src][edgeType].push(tgt);
      tgt2src[tgt][edgeType].push(src);
    }
    this.addParentAndMetaEdge4Edges(src2tgt);
    this.addParentAndMetaEdge4Edges(tgt2src);

    this.performLayout();
    this.add2GraphHistory('Summarize with containers');
  }

  private addParentAndMetaEdge4Edges(node2node, isSrc = true) {
    for (let src in node2node) {
      for (let edgeType in node2node[src]) {
        if (node2node[src][edgeType].length < this.CROWDED_NEI_LIMIT) {
          continue;
        }
        let hasParent = false;
        for (let i = 0; i < node2node[src][edgeType].length; i++) {
          if (this.cy.$id(node2node[src][edgeType][i]).parent().length > 0) {
            hasParent = true;
            break;
          }
        }
        if (hasParent) {
          continue;
        }
        const parentId = new Date().getTime();
        this.addParentNode(parentId); // adds a 'c' to the ID
        const targets = this.cy.collection();
        for (let i = 0; i < node2node[src][edgeType].length; i++) {
          let tgt = node2node[src][edgeType][i];
          const target = this.cy.$id(tgt);
          targets.merge(target)
          target.move({ parent: 'c' + parentId });
        }
        let metaEdge = null;
        if (isSrc) {
          metaEdge = this.cy.add({
            data: {
              source: src,
              target: 'c' + parentId,
            },
            classes: edgeType + ' MetaEdge',
          });
        } else {
          metaEdge = this.cy.add({
            data: {
              source: 'c' + parentId,
              target: src,
            },
            classes: edgeType + ' MetaEdge',
          });
        }

        let edges2remove = this.cy.$id(src).edgesWith(targets).remove();
        this.metaEdge2edge[metaEdge.id()] = edges2remove;
      }
    }
  }

  removeCrowdedGroups() {
    const groups = this.cy.$('.' + COMPOUND_CLASS);
    this.expandCollapseApi.expand(groups, EXPAND_COLLAPSE_FAST_OPT);

    // move to grandparent since parent will be deleted
    for (let i = 0; i < groups.length; i++) {
      const children: any = groups[i].children();
      const grandParent: any = groups[i].parent().id()
        ? groups[i].parent().id()
        : null;
      children.move({ parent: grandParent });
    }

    for (let k in this.metaEdge2edge) {
      this.metaEdge2edge[k].restore();
      this.cy.$id(k).remove();
    }

    if (groups) {
      groups.remove();
    }
    this.performLayout();
  }

  loadGraph4InstalledQuery(x) {
    let nodes: NodeResponse[] = [];
    this.findAllNodes(x, nodes);
    let edges: EdgeResponse[] = [];
    this.findAllEdges(x, edges);
    this.loadGraph({ edges: edges, nodes: nodes });
  }

  loadFromQuery(resp: InterprettedQueryResult) {
    console.log('from query: ', resp);
  }

  markovClustering() {
    let clusters = this.cy.$(':visible').markovClustering({ attributes: [() => { return 1; }] });
    for (let i = 0; i < clusters.length; i++) {
      this.addParentNode('_markov' + i);
      clusters[i].move({ parent: 'c' + '_markov' + i });
    }
  }

  degree1Clustering() {
    const node2node = {};
    const edges = this.cy.edges(':visible');
    for (let i = 0; i < edges.length; i++) {
      const src = edges[i].source().id();
      const tgt = edges[i].target().id();
      if (src == tgt) {
        continue;
      }
      if (this.cy.$id(src).parent().length > 0 || this.cy.$id(tgt).parent().length > 0) {
        continue;
      }
      if (node2node[src]) {
        node2node[src].push(tgt);
      } else {
        node2node[src] = [tgt];
      }
      if (node2node[tgt]) {
        node2node[tgt].push(src);
      } else {
        node2node[tgt] = [src];
      }
    }
    let cntCluster = 0;

    for (let k in node2node) {
      const neighbors = node2node[k]
      if (neighbors.length > 10) {
        const cluster = [];
        for (const nei of neighbors) {
          if (node2node[nei].length == 1) {
            cluster.push(this.cy.$id(nei));
          }
        }
        if (cluster.length >= 10) {
          this.addParentNode('_deg1' + cntCluster);
          for (const node of cluster) {
            node.move({ parent: 'c' + '_deg1' + cntCluster });
          }
        }
      }
    }
  }

  highlightElem(id: string) {
    const e = this.cy.$('#' + id);
    this.elems2highlight = null;
    if (e.isEdge()) {
      this.elems2highlight = this.elems2highlight.connectedNodes().union(e);
    } else {
      this.elems2highlight = e.neighborhood().union(e);
    }
    this.endlessOpacityAnim();
  }

  add2GraphHistory(expo: string, isImmediate = true) {
    const fn = () => {
      if (this.graphHistory.length > this._conf.appConf.graphHistoryLimit.getValue() - 1) {
        this.graphHistory.splice(0, 1);
      }
      const options = { bg: 'white', scale: 3, full: true };
      const base64png: string = this.cy.png(options);
      const elements = this.cy.json().elements;

      let g: GraphHistoryItem = {
        expo: expo,
        base64png: base64png,
        json: elements
      };
      this.graphHistory.push(g);
      this.currentHistoryIdx = this.graphHistory.length - 1;
      this.addNewGraphHistoryItem.next(true);
    };
    if (isImmediate) {
      fn();
    } else {
      setTimeout(fn, LAYOUT_ANIM_DUR);
    }
  }

  goBackInGraphHistory() {
    this.currentHistoryIdx--;
    if (this.currentHistoryIdx < 0) {
      this.currentHistoryIdx = 0;
    }
    this.loadCurrentIdxFromGraphHistory();
  }

  goForwardInGraphHistory() {
    this.currentHistoryIdx++;
    if (this.currentHistoryIdx > this.graphHistory.length - 1) {
      this.currentHistoryIdx = this.graphHistory.length - 1;
    }
    this.loadCurrentIdxFromGraphHistory();
  }

  loadCurrentIdxFromGraphHistory() {
    let g = this.graphHistory[this.currentHistoryIdx];
    this.cy.json({ elements: g.json });
  }

  addFnStyles() {
    this.cy.style()
      .selector('edge')
      .style({
        'label': (e) => {
          return e.classes()[0];
        },
      })
      .selector('edge.' + COLLAPSED_EDGE_CLASS)
      .style({
        'label': (e) => {
          return '(' + e.data('collapsedEdges').length + ')';
        },
        'width': (e) => {
          let n = e.data('collapsedEdges').length;
          return (3 + Math.log2(n)) + 'px';
        },
      })
      .selector('node')
      .style({
        'label': (e) => {
          return e.classes()[0] + '\n' + e.id().split('_')[1];
        },
      })
      .selector('node.' + COMPOUND_CLASS)
      .style({ 'label': '', })
      .update();
  }

  private endlessOpacityAnim() {
    if (!this.elems2highlight) {
      return;
    }
    else {
      const a = this.elems2highlight.animation({ style: { opacity: 0.5 }, duration: 500 });
      a.play() // start
        .promise('completed').then(function () { // on next completed
          a.reverse() // switch animation direction
            .rewind() // optional but makes intent clear
            .play(); // start again
        });
      setTimeout(() => { this.endlessOpacityAnim() }, 1000);
    }
  }

  private findAllNodes(x, r: NodeResponse[]) {
    if (x === null || x === undefined || isPrimitiveType(x)) {
      return;
    }
    for (let k in x) {
      if (isNodeResponse(x[k])) {
        r.push(x[k]);
      } else {
        this.findAllNodes(x[k], r);
      }
    }
  }

  private findAllEdges(x, r: EdgeResponse[]) {
    if (x === null || x === undefined || isPrimitiveType(x)) {
      return;
    }
    for (let k in x) {
      if (isEdgeResponse(x[k])) {
        r.push(x[k]);
      } else {
        this.findAllEdges(x[k], r);
      }
    }
  }

  private addParentNode(idSuffix: string | number, parent = undefined) {
    const id = 'c' + idSuffix;
    const parentNode = this.createCyNode({ labels: [COMPOUND_CLASS], properties: { end_datetime: 0, begin_datetime: 0, name: name } }, id);
    this.cy.add(parentNode);
    this.cy.$('#' + id).move({ parent: parent });
  }

  private createCyNode(node, id) {
    const classes = node.labels.join(' ');
    let properties = node.properties;
    properties.id = id

    return { data: properties, classes: classes };
  }
}
