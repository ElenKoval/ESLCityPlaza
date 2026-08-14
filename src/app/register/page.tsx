import { RegisterForm } from "@/components/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="auth-shell">
      <h1>Join ESL on Plaza</h1>
      <p className="sub">
        Your application will be reviewed. After approval you can sign up for
        classes and use the chat.
      </p>
      <RegisterForm />
    </div>
  );
}
