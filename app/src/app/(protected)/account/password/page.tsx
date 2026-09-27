import { changeOwnPassword } from "@/lib/actions/users";
import { PasswordForm } from "../../users/PasswordForm";

export default function ChangePasswordPage() {
  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">パスワード変更</h1>
      <section className="max-w-2xl rounded-lg border border-slate-200 bg-white p-6">
        <PasswordForm action={changeOwnPassword} askCurrent submitLabel="パスワードを変更" />
      </section>
    </div>
  );
}
