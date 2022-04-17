import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-input-number-dialog',
  templateUrl: './input-number-dialog.component.html',
  styleUrls: ['./input-number-dialog.component.css']
})
export class InputNumberDialogComponent implements OnInit {

  constructor(
    public dialogRef: MatDialogRef<InputNumberDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { prompt: string, num: number },
  ) { }

  onNoClick(): void {
    this.dialogRef.close();
  }

  passData() {
    this.dialogRef.close(this.data.num);
  }

  ngOnInit(): void {
  }

}
