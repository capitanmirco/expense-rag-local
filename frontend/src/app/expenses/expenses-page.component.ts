import { Component, Inject, OnDestroy, signal } from "@angular/core";
import { CommonModule, DOCUMENT } from "@angular/common";
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import { ExpensesApiService, Expense } from "../core/expenses-api.service";
import { ChatWidgetComponent } from "../chat/chat-widget.component";

@Component({
  standalone: true,
  selector: "app-expenses-page",
  imports: [CommonModule, ReactiveFormsModule, ChatWidgetComponent],
  templateUrl: "./expenses-page.component.html",
  styleUrls: ["./expenses-page.component.css"]
})
export class ExpensesPageComponent implements OnDestroy {
  items = signal<Expense[]>([]);
  editingId = signal<string | null>(null);
  modalOpen = signal(false);
  pageIndex = signal(0);
  pageSize = 5;

  form = this.fb.group({
    date: this.fb.control<string>("", { validators: [Validators.required], nonNullable: true }),
    amount: this.fb.control<number>(0, { validators: [Validators.required, Validators.min(0)], nonNullable: true }),
    category: this.fb.control<string>("general", { nonNullable: true }),
    description: this.fb.control<string>("", { nonNullable: true })
  });

  constructor(
    private fb: FormBuilder,
    private api: ExpensesApiService,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.reload();
  }

  reload() {
    this.api.list().subscribe(list => {
      this.items.set(list);
      this.clampPageIndex(list.length);
    });
  }

  save() {
    const payload = { ...this.form.getRawValue(), currency: "EUR" };
    const id = this.editingId();

    if (!id) {
      this.api.create(payload as any).subscribe(() => { this.reset(); this.reload(); });
      return;
    }

    this.api.update(id, payload as any).subscribe(() => { this.reset(); this.reload(); });
  }

  edit(e: Expense) {
    this.editingId.set(e.id);
    this.form.setValue({ date: e.date, amount: e.amount, category: e.category, description: e.description });
  }

  del(e: Expense) {
    this.api.remove(e.id).subscribe(() => this.reload());
  }

  reset() {
    this.editingId.set(null);
    this.form.setValue({ date: "", amount: 0, category: "general", description: "" });
  }

  pagedItems() {
    const start = this.pageIndex() * this.pageSize;
    return this.items().slice(start, start + this.pageSize);
  }

  pageCount() {
    const total = this.items().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  pageStart() {
    const total = this.items().length;
    if (total === 0) return 0;
    return this.pageIndex() * this.pageSize + 1;
  }

  pageEnd() {
    const total = this.items().length;
    if (total === 0) return 0;
    return Math.min((this.pageIndex() + 1) * this.pageSize, total);
  }

  prevPage() {
    if (this.pageIndex() === 0) return;
    this.pageIndex.set(this.pageIndex() - 1);
  }

  nextPage() {
    if (this.pageIndex() >= this.pageCount() - 1) return;
    this.pageIndex.set(this.pageIndex() + 1);
  }

  private clampPageIndex(total: number) {
    const maxIndex = Math.max(0, Math.ceil(total / this.pageSize) - 1);
    if (this.pageIndex() > maxIndex) {
      this.pageIndex.set(maxIndex);
    }
  }

  openModal() {
    this.modalOpen.set(true);
    this.document.body.classList.add("modal-open");
  }

  closeModal() {
    this.modalOpen.set(false);
    this.document.body.classList.remove("modal-open");
  }

  ngOnDestroy() {
    this.document.body.classList.remove("modal-open");
  }
}
