export const OBJ_INFO_UPDATE_DELAY = 200;

export const EXPAND_COLLAPSE_FAST_OPT = {
  layoutBy: null,
  fisheye: false,
  animate: false,
};

export const LAYOUT_ANIM_DUR = 500;

export const Layout = {
  fcose: {
    name: 'fcose',
    // 'draft', 'default' or 'proof' 
    // - 'draft' only applies spectral layout 
    // - 'default' improves the quality with incremental layout (fast cooling rate)
    // - 'proof' improves the quality with incremental layout (slow cooling rate) 
    quality: 'default',
    // use random node positions at beginning of layout
    // if this is set to false, then quality option must be 'proof'
    randomize: true,
    // whether or not to animate the layout
    animate: true,
    // duration of animation in ms, if enabled
    animationDuration: LAYOUT_ANIM_DUR,
    // easing of animation, if enabled
    animationEasing: undefined,
    // fit the viewport to the repositioned nodes
    fit: true,
    // padding around layout
    padding: 10,
    // whether to include labels in node dimensions. Valid in 'proof' quality
    nodeDimensionsIncludeLabels: false,

    /* spectral layout options */

    // false for random, true for greedy sampling
    samplingType: true,
    // sample size to construct distance matrix
    sampleSize: 25,
    // separation amount between nodes
    nodeSeparation: 75,
    // power iteration tolerance
    piTol: 0.0000001,

    /* incremental layout options */

    // Node repulsion (non overlapping) multiplier
    nodeRepulsion: 4500,
    // Ideal edge (non nested) length
    idealEdgeLength: 50,
    // Divisor to compute edge forces
    edgeElasticity: 0.45,
    // Nesting factor (multiplier) to compute ideal edge length for nested edges
    nestingFactor: 0.1,
    // Gravity force (constant)
    gravity: 0.25,
    // Maximum number of iterations to perform
    numIter: 2500,
    // For enabling tiling
    tile: false,
    // Represents the amount of the vertical space to put between the zero degree members during the tiling operation(can also be a function)
    tilingPaddingVertical: 10,
    // Represents the amount of the horizontal space to put between the zero degree members during the tiling operation(can also be a function)
    tilingPaddingHorizontal: 10,
    // Gravity range (constant) for compounds
    gravityRangeCompound: 1.5,
    // Gravity force (constant) for compounds
    gravityCompound: 1.0,
    // Gravity range (constant)
    gravityRange: 3.8,
    // Initial cooling factor for incremental layout  
    initialEnergyOnIncremental: 0.3,

    /* layout event callbacks */
    ready: () => { }, // on layoutready
    stop: () => { } // on layoutstop
  },
  dagre: {
    name: 'dagre',
    // dagre algo options, uses default value on undefined
    nodeSep: undefined, // the separation between adjacent nodes in the same rank
    edgeSep: undefined, // the separation between adjacent edges in the same rank
    rankSep: undefined, // the separation between each rank in the layout
    rankDir: undefined, // 'TB' for top to bottom flow, 'LR' for left to right,
    ranker: undefined, // Type of algorithm to assign a rank to each node in the input graph. Possible values: 'network-simplex', 'tight-tree' or 'longest-path'
    minLen: function (edge) { return 1; }, // number of ranks to keep between the source and target of the edge
    edgeWeight: function (edge) { return 1; }, // higher weight edges are generally made shorter and straighter than lower weight edges

    // general layout options
    fit: true, // whether to fit to viewport
    padding: 30, // fit padding
    spacingFactor: undefined, // Applies a multiplicative factor (>0) to expand or compress the overall area that the nodes take up
    nodeDimensionsIncludeLabels: false, // whether labels should be included in determining the space used by a node
    animate: true, // whether to transition the node positions
    animateFilter: function (node, i) { return true; }, // whether to animate specific nodes when animation is on; non-animated nodes immediately go to their final positions
    animationDuration: 500, // duration of animation in ms if enabled
    animationEasing: undefined, // easing of animation if enabled
    boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
    transform: function (node, pos) { return pos; }, // a function that applies a transform to the final node position
    ready: function () { }, // on layoutready
    stop: function () { } // on layoutstop
  },
}

export function isPrimitiveType(o) {
  const t = typeof o;
  return t == 'string' || t == 'number' || t == 'boolean';
}

export function readTxtFile(file: File, cb: (s: string) => void) {
  const fileReader = new FileReader();
  fileReader.onload = () => {
    try {
      cb(fileReader.result as string);
    } catch (error) {
      console.error('Given file is not suitable.', error);
    }
  };
  fileReader.onerror = (error) => {
    console.error('File could not be read!', error);
    fileReader.abort();
  };
  fileReader.readAsText(file);
}

export const COLLAPSED_EDGE_CLASS = 'cy-expand-collapse-collapsed-edge';
export const COLLAPSED_NODE_CLASS = 'cy-expand-collapse-collapsed-node';
export const COMPOUND_CLASS = '_Compound_';
export const EXPAND_COLLAPSE_CUE_SIZE = 12;

export function expandCollapseCuePosition(node) {
  const zoom = node._private.cy.zoom();
  let smallness = 1 - node.renderedWidth() / (node._private.cy.width());
  if (smallness < 0) {
    smallness = 0;
  }
  // cue size / 2
  const rectSize = EXPAND_COLLAPSE_CUE_SIZE / 2;
  const offset = parseFloat(node.css('border-width')) + rectSize;
  let size = zoom < 1 ? rectSize / zoom : rectSize;
  let add = offset * smallness + size;
  const x = node.position('x') - node.width() / 2 - parseFloat(node.css('padding-left')) + add;
  const y = node.position('y') - node.height() / 2 - parseFloat(node.css('padding-top')) + add;
  return { x: x, y: y };
}

/** https://davidwalsh.name/javascript-debounce-function
   * Returns a function, that, as long as it continues to be invoked, will not
   * be triggered. The function will be called after it stops being called for
   * N milliseconds. If `immediate` is passed, trigger the function on the
   * leading edge, instead of the trailing.
   * @param  {} func
   * @param  {number} wait
   * @param  {boolean=false} immediate
   * @param  {} preConditionFn=null if function returns false, ignore this call
   */
export function debounce(func, wait: number, immediate: boolean = false, preConditionFn: Function | null = null) {
  let timeout;
  return function () {
    if (preConditionFn && !preConditionFn()) {
      return;
    }
    const context = this, args = arguments;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

export const MAX_HIGHLIGHT_CNT = 12;

export function obj2str(o): string {
  let s = '';
  for (let k in o) {
    if (isPrimitiveType(o[k])) {
      s += '' + o[k];
    } else {
      s += obj2str(o[k]);
    }
  }

  return s;
}

/**
 * Deep copy function for TypeScript.
 * @param T Generic type of target/copied value.
 * @param target Target value to be copied.
 * @see Source project, ts-deepcopy https://github.com/ykdr2017/ts-deepcopy
 * @see Code pen https://codepen.io/erikvullings/pen/ejyBYg
 */
export const deepCopy = <T>(target: T): T => {
  if (target === null) {
    return target;
  }
  if (target instanceof Date) {
    return new Date(target.getTime()) as any;
  }
  if (target instanceof Array) {
    const cp = [] as any[];
    (target as any[]).forEach((v) => { cp.push(v); });
    return cp.map((n: any) => deepCopy<any>(n)) as any;
  }
  if (typeof target === 'object' && target !== {}) {
    const cp = { ...(target as { [key: string]: any }) } as { [key: string]: any };
    Object.keys(cp).forEach(k => {
      cp[k] = deepCopy<any>(cp[k]);
    });
    return cp as T;
  }
  return target;
};

// https://www.w3schools.com/howto/howto_js_draggable.asp
export function makeElemDraggable(elem: HTMLElement, dragHandle: HTMLElement, onDrag) {
  var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  dragHandle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;

    // lower all the draggable divs on z-index
    const draggableDivs = document.getElementsByClassName('draggable-content');
    for (let i = 0; i < draggableDivs.length; i++) {
      (draggableDivs[i] as HTMLElement).style.zIndex = '1001';
    }
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    let newTop = elem.offsetTop - pos2;
    if (newTop < 10) {
      newTop = 10;
    }
    if (newTop > window.innerHeight - 40) {
      newTop = window.innerHeight - 40;
    }
    elem.style.top = newTop + "px";
    elem.style.left = (elem.offsetLeft - pos1) + "px";
    elem.style.zIndex = '1002';
    if (onDrag) {
      onDrag();
    }
  }

  function closeDragElement() {
    /* stop moving when mouse button is released:*/
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

export function getCyStyleFromColorAndWid(color: string, wid: number): { nodeCss: any, edgeCss: any } {
  return {
    nodeCss: {
      "underlay-color": color,
      "underlay-opacity": 0.5,
      "underlay-padding": wid,
    },
    edgeCss: {
      "underlay-color": color,
      "underlay-opacity": 0.5,
      "underlay-padding": wid,
    }
  };
}