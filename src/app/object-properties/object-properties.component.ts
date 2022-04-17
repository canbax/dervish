import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { SharedService } from '../shared.service';
import { debounce, OBJ_INFO_UPDATE_DELAY } from '../constants';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-object-properties',
  templateUrl: './object-properties.component.html',
  styleUrls: ['./object-properties.component.css']
})
export class ObjectPropertiesComponent implements OnInit, OnDestroy {

  tableHeader = '';
  objType = '';
  isShowTable = false;
  keys: string[];
  values: any[];
  subscription: Subscription;
  subscription2: Subscription;

  constructor(private _s: SharedService, private _snackBar: MatSnackBar) {
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.subscription2.unsubscribe();
  }

  isLink(txt: string) {
    if (typeof txt == 'string') {
      return txt.toLowerCase().startsWith('http:/');
    }
    return false;
  }

  ngOnInit(): void {
    const fn = debounce(this.showObjProps, OBJ_INFO_UPDATE_DELAY).bind(this)
    this.subscription = this._s.elemSelectChanged.subscribe(fn);
    this.subscription2 = this._s.showTableChanged.subscribe(fn);

    this.showObjProps();
  }

  showObjProps() {
    const d = this._s.cy.$(':selected').data();
    if (typeof d != "object") {
      return;
    }
    this.isShowTable = false;
    this.prepareTableIfNeeded();
    this.objType = this._s.cy.$(':selected').classes()[0];
    this.keys = Object.keys(d);
    this.values = Object.values(d);
  }

  showDataInTable() {
    this.isShowTable = true;
  }

  // if multiple objects from the same type is selected, show a table
  prepareTableIfNeeded() {
    this.isShowTable = true;
    let elems = this._s.cy.$(':selected');
    let elems2add = this._s.cy.collection();
    for (let i = 0; i < elems.length; i++) {
      if (elems[i].isParent()) {
        elems2add.merge(elems[i].children());
      }
    }
    elems = elems.not(':parent').union(elems2add);
    const classes = {};
    for (let i = 0; i < elems.length; i++) {
      classes[elems[i].classes()[0]] = true;
    }
    const data = [];
    const cNames = Object.keys(classes);
    if (elems.length < 2 || cNames.length > 1) {
      this.tableHeader = '';
      this.isShowTable = false;
      return;
    }
    this.tableHeader = cNames.join();
    const colsDict = {};
    for (let i = 0; i < elems.length; i++) {
      const d = elems[i].data();
      data.push(d);
      const keys = Object.keys(d);
      for (let j = 0; j < keys.length; j++) {
        if (typeof this._s.showCertainPropsInTable == "object") {
          if (this._s.showCertainPropsInTable[keys[j]]) {
            colsDict[keys[j]] = true;
          }
        } else {
          colsDict[keys[j]] = true;
        }
      }
    }
    const cols = Object.keys(colsDict);

    setTimeout(() => {
      this._s.tableData.next({ columns: cols, data: data });
    }, 0);
  }

  copy(txt: string) {
    this._snackBar.open(`'${txt}' copied!`, 'OK', {
      duration: 5000
    });
  }
}
