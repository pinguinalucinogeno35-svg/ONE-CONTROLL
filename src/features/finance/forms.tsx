"use client";

import { MoneyField, SelectField, ServerForm, TextAreaField, TextField } from "@/components/ui/server-form";
import { PAYMENT_METHOD } from "@/lib/labels";
import { todayISO } from "@/lib/dates";
import {
  cancelPayableAction, cancelReceivableAction, confirmReceiptAction, createCashAccountAction, createReceivableAction, payPayableAction,
  registerPayableAction, rejectExpenseAction, requestExpenseAction, reverseReceiptAction, reversePaymentAction, transferAction,
} from "./actions";

type Opt = { id: string; name: string };
const methods = Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }));
const accountOpts = (a: Opt[]) => a.map((x) => ({ value: x.id, label: x.name }));

export function ReceiptForm({ receivableId, balance, accounts }: { receivableId: string; balance: string; accounts: Opt[] }) {
  return (
    <ServerForm action={confirmReceiptAction} submitLabel="Confirmar recebimento" variant="success" idempotencyPrefix="rcpt" className="grid gap-3 sm:grid-cols-5 sm:items-end">
      <input type="hidden" name="receivable_id" value={receivableId} />
      <SelectField name="cash_account_id" label="Conta" options={accountOpts(accounts)} />
      <MoneyField name="amount" label="Valor recebido" defaultValue={balance.replace(".", ",")} hint="Parcial permitido" />
      <SelectField name="payment_method" label="Forma" options={methods} defaultValue="pix" />
      <TextField name="received_at" label="Data" type="date" defaultValue={todayISO()} />
      <TextField name="reference" label="Referência" placeholder="ID PIX, nº boleto…" />
    </ServerForm>
  );
}

export function PayForm({ payableId, balance, accounts }: { payableId: string; balance: string; accounts: Opt[] }) {
  return (
    <ServerForm action={payPayableAction} submitLabel="Confirmar pagamento" variant="success" idempotencyPrefix="pay" className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <input type="hidden" name="payable_id" value={payableId} />
      <SelectField name="cash_account_id" label="Conta" options={accountOpts(accounts)} />
      <MoneyField name="amount" label="Valor pago" defaultValue={balance.replace(".", ",")} hint="Parcial permitido" />
      <SelectField name="payment_method" label="Forma" options={methods} defaultValue="pix" />
      <TextField name="paid_at" label="Data" type="date" defaultValue={todayISO()} />
    </ServerForm>
  );
}

export function ReasonForm({ kind, id, label: submitLabel }: { kind: "reverse_receipt" | "reverse_payment" | "reject_expense" | "cancel_payable" | "cancel_receivable"; id: string; label: string }) {
  const action = {
    reverse_receipt: reverseReceiptAction, reverse_payment: reversePaymentAction, reject_expense: rejectExpenseAction,
    cancel_payable: cancelPayableAction, cancel_receivable: cancelReceivableAction,
  }[kind].bind(null, id);
  return (
    <ServerForm action={action} submitLabel={submitLabel} variant="danger" className="flex flex-col gap-2 sm:flex-row sm:items-end"
      confirm="Confirmar? A operação é registrada na auditoria e não apaga o histórico.">
      <TextField name="reason" label="Motivo" required className="flex-1" />
    </ServerForm>
  );
}

export function ExpenseFields({ categories, clients, projects }: { categories: Opt[]; clients?: Opt[]; projects?: Opt[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField name="category_id" label="Categoria" options={accountOpts(categories)} placeholder="Selecione" />
      <TextField name="description" label="Descrição" required />
      <MoneyField name="amount" label="Valor (R$)" required />
      <TextField name="due_date" label="Vencimento" type="date" />
      <TextField name="supplier_name" label="Fornecedor" />
      <TextField name="competence_month" label="Competência" type="date" hint="Qualquer dia do mês de referência" />
      {clients && <SelectField name="client_id" label="Cliente (opcional)" options={accountOpts(clients)} placeholder="Nenhum" />}
      {projects && <SelectField name="project_id" label="Projeto (opcional)" options={accountOpts(projects)} placeholder="Nenhum" />}
    </div>
  );
}

export function RequestExpenseForm({ categories, clients }: { categories: Opt[]; clients: Opt[] }) {
  return (
    <ServerForm action={requestExpenseAction} submitLabel="Solicitar reembolso/despesa" resetOnSuccess>
      <ExpenseFields categories={categories} clients={clients} />
    </ServerForm>
  );
}

export function RegisterPayableForm({ kind, categories, clients, projects, defaultProject }: { kind: "expense" | "direct_cost"; categories: Opt[]; clients?: Opt[]; projects?: Opt[]; defaultProject?: string }) {
  return (
    <ServerForm action={registerPayableAction.bind(null, kind)} submitLabel={kind === "direct_cost" ? "Lançar custo" : "Lançar despesa"} resetOnSuccess>
      <ExpenseFields categories={categories} clients={clients} projects={projects} />
      {defaultProject && <input type="hidden" name="project_id" value={defaultProject} />}
    </ServerForm>
  );
}

export function NewReceivableForm({ clients }: { clients: Opt[] }) {
  return (
    <ServerForm action={createReceivableAction} submitLabel="Criar cobrança" resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="client_id" label="Cliente" options={accountOpts(clients)} placeholder="Selecione" />
        <SelectField name="type" label="Tipo" options={[{ value: "additional_service", label: "Serviço adicional" }, { value: "other", label: "Outro" }]} />
        <TextField name="description" label="Descrição" required />
        <MoneyField name="amount" label="Valor (R$)" required />
        <TextField name="due_date" label="Vencimento" type="date" required />
        <TextField name="external_reference" label="Referência externa" />
      </div>
    </ServerForm>
  );
}

export function CashAccountForm() {
  return (
    <ServerForm action={createCashAccountAction} submitLabel="Criar conta" resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Nome da conta" required placeholder="Conta bancária principal" />
        <SelectField name="account_type" label="Tipo" options={[{ value: "bank", label: "Banco" }, { value: "cash", label: "Caixa físico" }, { value: "digital_wallet", label: "Carteira digital" }, { value: "other", label: "Outro" }]} />
        <MoneyField name="opening_balance" label="Saldo inicial" hint="Só pode ser alterado enquanto a conta não tiver movimentos" />
        <TextField name="opening_date" label="Data do saldo inicial" type="date" defaultValue={todayISO()} />
      </div>
    </ServerForm>
  );
}

export function TransferForm({ accounts }: { accounts: Opt[] }) {
  return (
    <ServerForm action={transferAction} submitLabel="Transferir" resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="from" label="De" options={accountOpts(accounts)} />
        <SelectField name="to" label="Para" options={accountOpts(accounts)} />
        <MoneyField name="amount" label="Valor" required />
        <TextField name="occurred_at" label="Data" type="date" defaultValue={todayISO()} />
        <TextAreaField name="description" label="Descrição" className="sm:col-span-2" />
      </div>
    </ServerForm>
  );
}
