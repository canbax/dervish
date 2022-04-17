import { Component } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject } from 'rxjs';
import { getCyStyleFromColorAndWid, Layout } from '../constants';
import { AppConfig, TigerGraphDbConfig } from '../data-types';
import { SettingsService } from '../settings.service';
import { SharedService } from '../shared.service';
import { TigerGraphApiClientService } from '../tiger-graph-api.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent {
  tigerGraphDbConf: TigerGraphDbConfig = { password: '', secret: '', token: '', tokenExpire: 0, url: '', username: '', graphName: '', proxyUrl: '' };
  tokenExpireDateStr = '';
  appConf: AppConfig;
  currHighlightStyle: { wid: number, color: string, name: string };
  currHighlightIdx: number;
  isIgnoreCaseInText: boolean;
  isGroupCrowdedNeigbors: boolean;
  layoutOptions: string[];
  currLayout: string;
  nodeTypes: string[] = [];

  constructor(private _s: SharedService, private _c: SettingsService, private _dbApi: TigerGraphApiClientService, private _snackBar: MatSnackBar) {
    this.syncDbConfig();
    this.syncAppConfig();
    this.layoutOptions = Object.keys(Layout);
  }

  copy(txt: string) {
    this.showSnackbar(`'${txt}' copied!`);
  }

  private showSnackbar(txt: string) {
    this._snackBar.open(txt, 'OK', {
      duration: 5000
    });
  }

  saveDbConfig() {
    this.changeTigerGraphDbConfigs();
  }

  refreshDbToken() {
    this._s.isLoading.next(true);
    this._dbApi.refreshToken((x: any) => {
      this.tigerGraphDbConf.tokenExpire = x.expiration;
      this.tigerGraphDbConf.token = x.results.token;
      this.changeTigerGraphDbConfigs();
      this.tokenExpireDateStr = new Date(this.tigerGraphDbConf.tokenExpire * 1000).toDateString();
      this._s.isLoading.next(false);
    });
  }

  private syncAppConfig() {
    this.appConf = this._c.appConf;
    this.currHighlightIdx = this.appConf.currHighlightIdx.getValue();
    const curr = this.appConf.highlightStyles[this.currHighlightIdx];
    this.currHighlightStyle = { color: curr.color.getValue(), name: curr.name.getValue(), wid: curr.wid.getValue() };
    this.isIgnoreCaseInText = this.appConf.isIgnoreCaseInText.getValue();
    this.currLayout = this.appConf.currLayout.getValue();
    this.nodeTypes = this.appConf.nodeTypes.map(x => x.getValue());
  }

  private syncDbConfig() {
    const c = this._c.appConf.tigerGraphDbConfig;
    this.tigerGraphDbConf.url = c.url.getValue();
    this.tigerGraphDbConf.secret = c.secret.getValue();
    this.tigerGraphDbConf.username = c.username.getValue();
    this.tigerGraphDbConf.password = c.password.getValue();
    this.tigerGraphDbConf.token = c.token.getValue();
    this.tigerGraphDbConf.tokenExpire = c.tokenExpire.getValue();
    this.tigerGraphDbConf.graphName = c.graphName.getValue();
    this.tigerGraphDbConf.proxyUrl = c.proxyUrl.getValue();
    this.tokenExpireDateStr = new Date(this.tigerGraphDbConf.tokenExpire * 1000).toDateString();

  }

  changeCurrHiglightStyle() {
    const curr = this.appConf.highlightStyles[this.currHighlightIdx];
    this.appConf.currHighlightIdx.next(this.currHighlightIdx);
    this.currHighlightStyle.color = curr.color.getValue();
    this.currHighlightStyle.name = curr.name.getValue();
    this.currHighlightStyle.wid = curr.wid.getValue();
    this._c.setAppConfig();
  }

  changeHighlightStyle() {
    let cyStyle = getCyStyleFromColorAndWid(this.currHighlightStyle.color, this.currHighlightStyle.wid);
    this._s.viewUtils.changeHighlightStyle(this.currHighlightIdx, cyStyle.nodeCss, cyStyle.edgeCss);

    this.appConf.highlightStyles[this.currHighlightIdx].color.next(this.currHighlightStyle.color);
    this.appConf.highlightStyles[this.currHighlightIdx].wid.next(this.currHighlightStyle.wid);
    this.appConf.highlightStyles[this.currHighlightIdx].name.next(this.currHighlightStyle.name);
    this._c.setAppConfig();
  }

  deleteHighlightStyle() {
    if (this._s.viewUtils.getAllHighlightClasses().length < 2) {
      return;
    }
    this._s.viewUtils.removeHighlightStyle(this.currHighlightIdx);
    this.appConf.highlightStyles.splice(this.currHighlightIdx, 1);
    if (this.currHighlightIdx >= this.appConf.highlightStyles.length) {
      this.currHighlightIdx = this.appConf.highlightStyles.length - 1;
    }
    const curr = this.appConf.highlightStyles[this.currHighlightIdx];
    this.currHighlightStyle = { color: curr.color.getValue(), name: curr.name.getValue(), wid: curr.wid.getValue() };
    this._c.setAppConfig();
  }

  addHighlightStyle() {
    let cyStyle = getCyStyleFromColorAndWid(this.currHighlightStyle.color, this.currHighlightStyle.wid);
    this._s.viewUtils.addHighlightStyle(cyStyle.nodeCss, cyStyle.edgeCss);
    this.appConf.highlightStyles.push({
      wid: new BehaviorSubject<number>(this.currHighlightStyle.wid),
      color: new BehaviorSubject<string>(this.currHighlightStyle.color), name: new BehaviorSubject<string>(this.currHighlightStyle.name)
    });
    this.currHighlightIdx = this.appConf.highlightStyles.length - 1;
    this._c.setAppConfig();
  }

  changeConfig(s: string) {
    this.appConf[s].next(this[s]);
    this._c.setAppConfig();
  }

  changeTigerGraphDbConfigs() {
    for (const key in this.appConf.tigerGraphDbConfig) {
      if (key == 'url' && this.tigerGraphDbConf[key].endsWith('/')) {
        this.tigerGraphDbConf[key] = this.tigerGraphDbConf[key].substring(0, this.tigerGraphDbConf[key].length - 1);
      }
      this.appConf.tigerGraphDbConfig[key].next(this.tigerGraphDbConf[key]);
    }
    this._c.setAppConfig();
  }
}
