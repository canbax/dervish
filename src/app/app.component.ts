import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GENERAL_CY_STYLE } from './config/general-cy-style';
import { readTxtFile } from './constants';
import { SettingsService } from './settings.service';
import { SharedService } from './shared.service';
import { TigerGraphApiClientService } from './tiger-graph-api.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  selectedRightTabIdx = 0;
  isLoading = true;
  isResizing = false;
  isAutoSizeSideNav: boolean = false;
  widthRatioCSS = '30vw';
  private loadFileType: 'LoadGraph' | 'LoadStyle' = 'LoadGraph';
  @ViewChild('fileInp', { static: false }) fileInp;

  constructor(private _dbApi: TigerGraphApiClientService, private _s: SharedService, private _settings: SettingsService, private _snackBar: MatSnackBar) {

  }

  ngOnInit(): void {
    this._s.init();
    const fn = (x) => {
      if (!x) {
        return;
      }
      this.selectedRightTabIdx = 2;
    };
    this._s.elemSelectChanged.subscribe(fn);
    this._s.showTableChanged.subscribe(fn);
    this._s.isLoading.subscribe(x => { this.isLoading = x; });
    this._settings.appConf.tigerGraphDbConfig.isConnected.subscribe(x => {
      if (!x) {
        this.selectedRightTabIdx = 3;
        this._snackBar.open('Connect to TigerGraph!', 'x');
      }
    });
  }

  loadSampleData() {
    this.clearData();
    this._s.isLoading.next(true);
    const fn = (x) => {
      this._s.loadGraph(x);
      this._s.isLoading.next(false);
      this._s.add2GraphHistory('Load sample data');
    };
    this._dbApi.sampleData(fn);
  }

  fileSelected() {
    readTxtFile(this.fileInp.nativeElement.files[0], (txt) => {
      const fileJSON = JSON.parse(txt);
      if (this.loadFileType == 'LoadGraph') {
        this._s.cy.json({ elements: fileJSON });
        this._s.cy.fit();
        this._s.add2GraphHistory('Load graph from file');
      } else if (this.loadFileType == 'LoadStyle') {
        // this._l.setRecentCyStyle(txt);
        this._s.cy.style().fromJson(GENERAL_CY_STYLE.concat(fileJSON)).update();
        this._s.addFnStyles();
        this._s.bindViewUtilitiesExtension();
      }

    });
  }

  saveGraph2File() {
    const json = this._s.cy.json();
    const elements = json.elements;
    if (!elements.nodes) {
      return;
    }
    if (this._s.isWarn4Collapsed(this._s.cy.$())) {
      return;
    }
    this.str2file(JSON.stringify(elements, undefined, 4), 'dervish-graph.json');
  }

  private str2file(str: string, fileName: string) {
    const blob = new Blob([str], { type: 'text/plain' });
    const anchor = document.createElement('a');
    anchor.download = fileName;
    anchor.href = (window.URL).createObjectURL(blob);
    anchor.dataset['downloadurl'] =
      ['text/plain', anchor.download, anchor.href].join(':');
    anchor.click();
  }

  loadGraphFromFile() {
    this.loadFileType = 'LoadGraph';
    this.fileInp.nativeElement.value = '';
    this.fileInp.nativeElement.click();
  }

  clearData() {
    this._s.cy.remove(this._s.cy.$());
    this._s.add2GraphHistory('Clear data');
  }

  summarizeNeig() {
    this._s.groupCrowdedNei();
  }

  clearContainers() {
    this._s.removeCrowdedGroups();
  }

  goBackInGraphHistory() {
    this._s.goBackInGraphHistory();
  }

  goForwardInGraphHistory() {
    this._s.goForwardInGraphHistory();
  }

  private refreshSideNav() {
    this.isAutoSizeSideNav = true;
    setTimeout(() => this.isAutoSizeSideNav = false, 1);
  }

  @HostListener('document:keydown.delete', ['$event'])
  deleteSelected() {
    this._s.deleteSelected();
  }

  click2resizer() {
    this.isResizing = true;
  }

  @HostListener('document:mousemove', ['$event'])
  resizing($event) {
    if (!this.isResizing) {
      return;
    }
    const x = $event.clientX;
    const wid = window.innerWidth;
    this.widthRatioCSS = Math.floor((wid - x) / (wid) * 100) + 'vw';
    this.refreshSideNav();
  }

  @HostListener('document:mouseup', ['$event'])
  mouseUp() {
    this.isResizing = false;
  }

}
