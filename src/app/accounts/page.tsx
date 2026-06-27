import { listAccountsWithBalances } from "@/services/accounts";
import { formatEuros } from "@/lib/money";
import { AccountForm } from "@/components/accounts/account-form";
import { ArchiveButton } from "@/components/accounts/account-actions";
import { AccountMoveButtons } from "@/components/accounts/account-move-buttons";
import { AccountEditDialog } from "@/components/accounts/account-edit-dialog";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await listAccountsWithBalances(true);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Accounts</h1>

      <AccountForm />

      <section className="flex flex-col gap-2">
        {active.length === 0 ? (
          <p className="text-sm text-gray-500">
            No accounts yet. Add your first one above.
          </p>
        ) : (
          active.map((a, i) => (
            <AccountRow
              key={a.id}
              account={a}
              first={i === 0}
              last={i === active.length - 1}
            />
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-500">Archived</h2>
          {archived.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </section>
      )}
    </div>
  );
}

function AccountRow({
  account,
  first,
  last,
}: {
  account: Awaited<ReturnType<typeof listAccountsWithBalances>>[number];
  first?: boolean;
  last?: boolean;
}) {
  const sortable = first !== undefined; // active rows pass first/last
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {sortable && (
          <AccountMoveButtons
            id={account.id}
            first={!!first}
            last={!!last}
          />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{account.name}</p>
          <p className="text-xs text-gray-500">
            Opening {formatEuros(account.openingCents)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={
            account.balanceCents < 0
              ? "font-semibold text-red-600"
              : "font-semibold"
          }
        >
          {formatEuros(account.balanceCents)}
        </span>
        <AccountEditDialog
          id={account.id}
          name={account.name}
          openingCents={account.openingCents}
        />
        <ArchiveButton id={account.id} archived={account.archived} />
      </div>
    </div>
  );
}
