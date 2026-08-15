import { RegisterForm } from "@/components/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="auth-shell">
      <h1>Apply to join</h1>
      <p className="sub">
        Create an account. We will review your request, then you can join
        classes and chat.
      </p>
      <RegisterForm />
    </div>
  );
}
