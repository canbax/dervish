import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InputNumberDialogComponent } from './input-number-dialog.component';

describe('InputNumberDialogComponent', () => {
  let component: InputNumberDialogComponent;
  let fixture: ComponentFixture<InputNumberDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ InputNumberDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(InputNumberDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
