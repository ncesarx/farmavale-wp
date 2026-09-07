import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

const metrics = [
  ["Em atendimento", "18", "+12% hoje"],
  ["Aguardando", "07", "3 acima de 5 min"],
  ["Tempo médio", "3m 42s", "-18s este mês"],
  ["SLA cumprido", "94,8%", "Meta: 92%"],
];

const conversations = [
  ["CD", "Cliente Demonstração", "Pedido de demonstração aguardando confirmação", "09:45", "Alta"],
  ["CS", "Cliente Simulado", "Obrigado pelo atendimento!", "09:41", "Normal"],
  ["CT", "Contato de Teste", "Consulta de disponibilidade de produto", "09:38", "Normal"],
  ["EX", "Exemplo Atendimento", "Solicitação de alteração cadastral", "09:32", "Normal"],
];

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>♥</span><div><strong>farmavale</strong><small>CENTRAL</small></div></div>
        <nav>
          <a className="active">▣ <span>Atendimentos</span><b>12</b></a>
          <a>◫ <span>Visão geral</span></a><a>◎ <span>Clientes</span></a><a>▤ <span>Relatórios</span></a>
          <p>GESTÃO</p><a>⌁ <span>Integrações</span></a><a>◇ <span>Equipe e acesso</span></a>
        </nav>
        <div className="connection"><i /> WhatsApp aguardando configuração<small>Número de teste Meta</small></div>
      </aside>
      <section className="content">
        <header><div><small>CENTRAL DE ATENDIMENTO</small><h1>Atendimentos</h1></div><div className="live"><i /> {user.name} · {user.role}</div><button>+ Novo atendimento</button><LogoutButton /></header>
        <div className="metrics">{metrics.map(m=><article key={m[0]}><span>{m[0]}</span><strong>{m[1]}</strong><small className="green">{m[2]}</small></article>)}</div>
        <div className="workspace">
          <section className="queue">
            <div className="sectionTitle"><h2>Fila de conversas <small>25</small></h2><button>Filtros</button></div>
            <input placeholder="Buscar cliente, telefone ou protocolo" />
            <div className="tabs"><b>Todos 25</b><span>Aguardando 7</span><span>Meus 8</span></div>
            {conversations.map((c,i)=><article className={i===0?"conversation selected":"conversation"} key={c[1]}><div className="avatar">{c[0]}</div><div><strong>{c[1]}</strong><p>{c[2]}</p><small className={c[4]==="Alta"?"urgent":""}>{c[4]}</small></div><time>{c[3]}</time></article>)}
          </section>
          <section className="chat">
            <div className="chatHeader"><div className="avatar">CD</div><div><strong>Cliente Demonstração</strong><small>Número de teste · WhatsApp</small></div><span>Agente disponível</span></div>
            <div className="messages">
              <div className="system">Atendimento distribuído automaticamente · 09:42</div>
              <div className="bubble in">Olá! Fiz um pedido de teste e ainda não recebi a confirmação.</div>
              <div className="bubble out">Olá! Vou verificar agora. Pode informar o protocolo?</div>
              <div className="bubble in">É o protocolo <b>#DEMO-1001</b>.</div>
              <div className="order"><small>PEDIDO VINCULADO</small><strong>#DEMO-1001</strong><span>Em separação</span><dl><div><dt>Valor</dt><dd>R$ 0,00</dd></div><div><dt>Previsão</dt><dd>Ambiente de teste</dd></div></dl></div>
            </div>
            <form className="composer"><textarea placeholder="Digite sua mensagem..." /><button type="button">Enviar ➤</button></form>
          </section>
          <aside className="customer"><div className="avatar large">CD</div><h3>Cliente Demonstração</h3><p>Registro exclusivo para testes</p><hr/><h4>Informações do cliente</h4><dl><dt>Telefone</dt><dd>Número de teste</dd><dt>E-mail</dt><dd>Não informado</dd><dt>Unidade</dt><dd>Demonstração</dd></dl><hr/><h4>Etiquetas</h4><div className="tags"><span>Ambiente de teste</span><span>Entrega</span></div></aside>
        </div>
      </section>
    </main>
  );
}
