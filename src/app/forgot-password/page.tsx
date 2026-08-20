import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="auth-shell">
      <h1>Forgot password?</h1>
      <p className="sub">
        Enter your email and we&apos;ll send a link to reset your password.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
