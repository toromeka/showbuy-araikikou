"use client";

import { useActionState } from "react";
import { authenticate } from "@/lib/actions/auth-actions";

export default function LoginPage() {
  const [errorMessage, formAction, isPending] = useActionState(authenticate, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-bold text-slate-800">荒井機工 販売管理システム</h1>
        <p className="mb-6 text-sm text-slate-500">ログインしてください</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">ログインID</label>
        <input
          name="loginId"
          type="text"
          required
          autoFocus
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">パスワード</label>
        <input
          name="password"
          type="password"
          required
          className="mb-6 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? "ログイン中..." : "ログイン"}
        </button>

        {errorMessage && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
        )}
      </form>
    </div>
  );
}
