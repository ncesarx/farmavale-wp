import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="loginPage">
      <section className="loginBrand">
        <div className="loginMark">♥</div>
        <div><strong>farmavale</strong><span>CENTRAL</span></div>
        <h1>Atendimento conectado.<br />Gestão em tempo real.</h1>
        <p>Central segura para organizar conversas, equipes e indicadores.</p>
      </section>
      <section className="loginCard">
        <div>
          <small>ACESSO RESTRITO</small>
          <h2>Bem-vindo</h2>
          <p>Use suas credenciais corporativas para acessar.</p>
          <LoginForm />
          <footer><i /> Ambiente protegido e monitorado</footer>
        </div>
      </section>
    </main>
  );
}
