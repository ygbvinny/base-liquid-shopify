/*
  ============================================================
  carrinho.js — Carrinho AJAX + cart drawer (mini-carrinho)
  ============================================================

  O QUE FAZ:
  Melhoria progressiva para o carrinho da loja, sem framework.
  1. Intercepta o envio de qualquer formulario de add-to-cart e
     envia para a Cart AJAX API do Shopify (/cart/add.js).
  2. Controla o drawer lateral (snippets/carrinho.liquid): abrir,
     fechar (botoes, overlay, ESC), trava de foco e de scroll.
  3. Re-renderiza a lista de itens do drawer a partir de /cart.js,
     com subtotal, contadores e animacoes de entrada/saida.
  4. Altera quantidade e remove itens via /cart/change.js.

  OBSERVACOES:
  Funciona sem JS: o formulario de produto envia nativamente para
  /cart/add e o botao do header navega para /cart pelo href. Se a
  requisicao de add falhar, o script faz fallback e submete o
  formulario do jeito tradicional.
  O drawer ja vem renderizado pelo servidor (Liquid); o JS so
  reconstroi a lista depois de uma acao do usuario.

  GANCHOS (definidos em snippets/carrinho.liquid e sections/nav.liquid):
  [data-cart-drawer] [data-cart-drawer-open] [data-cart-drawer-close]
  [data-cart-drawer-overlay] [data-cart-items] [data-cart-line]
  [data-cart-line-key] [data-cart-qty-input] [data-cart-qty-increase]
  [data-cart-qty-decrease] [data-cart-remove] [data-cart-empty]
  [data-cart-footer] [data-cart-subtotal] [data-cart-count]

  ESTADOS DE CSS (todos ja existem no snippet):
  body.cart-drawer-open        drawer aberto + scroll travado
  .is-open                     no painel e no overlay (liga a cascata
                               de entrada do conteudo; removida ~1s
                               depois, quando a animacao termina)
  .cart-drawer__item--enter    item novo entrando (re-render)
  .cart-drawer__item--leave    item saindo (remocao)
  .is-bumping                  pulso nos contadores e no subtotal

  API OPCIONAL (window.cartDrawer):
  abrir(), fechar(), atualizar()  — uteis para outros scripts do tema.
*/
(function () {
  'use strict';

  /* ------------------------------------------------------------
     Constantes
     ------------------------------------------------------------ */
  const RAIZ = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  const URL_CARRINHO = `${RAIZ}cart.js`;
  const URL_ADICIONAR = `${RAIZ}cart/add.js`;
  const URL_ALTERAR = `${RAIZ}cart/change.js`;

  const SELETOR_FORM_ADD = 'form[action$="/cart/add"], form[data-type="add-to-cart-form"]';
  const SELETOR_FOCAVEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Duracao da cascata de entrada do drawer (maior delay 0.42s + 0.45s
  // de animacao). Passado esse tempo a classe .is-open sai do painel,
  // para que um re-render posterior nao re-anime a lista inteira.
  const DURACAO_CASCATA = 1000;
  const DURACAO_ENTRADA = 400; // .cart-drawer__item--enter
  const DURACAO_SAIDA = 250; // .cart-drawer__item--leave
  const DURACAO_PULSO = 600; // .is-bumping

  const MOEDA = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'BRL';

  // SVGs copiados de snippets/icon.liquid (o JS nao renderiza Liquid).
  const ICONES = {
    minus: '<svg width="24" height="24" viewBox="0 0 24 25" fill="none" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 12.5a.75.75 0 0 1-.75.75H3.75a.75.75 0 0 1 0-1.5h16.5a.75.75 0 0 1 .75.75Z"/></svg>',
    plus: '<svg width="24" height="24" viewBox="0 0 24 25" fill="none" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21 12.5a.75.75 0 0 1-.75.75h-7.5v7.5a.75.75 0 0 1-1.5 0v-7.5h-7.5a.75.75 0 0 1 0-1.5h7.5v-7.5a.75.75 0 0 1 1.5 0v7.5h7.5a.75.75 0 0 1 .75.75Z"/></svg>',
    trash: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path d="M3 5h14M8 5V3h4v2m-6 0 1 12h6l1-12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bag: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><g transform="translate(0,20) scale(1,-1)"><path fill="currentColor" d="M17.99 15.41a.63.63 0 0 1-.49.22H4.9l-.49 2.62a.63.63 0 0 1-.62.5H1.88a.63.63 0 0 1 0-1.25h1.4l1.99-10.95a2 2 0 0 1 .53-.99 1.9 1.9 0 0 1-.6-1.4c0-.6.22-1.1.65-1.53a2.1 2.1 0 0 1 1.54-.65c.6 0 1.1.22 1.55.65.42.43.63.94.63 1.54 0 .17-.02.33-.06.5H12.7a1.9 1.9 0 0 1-.06-.5c0-.6.22-1.1.65-1.54a2.1 2.1 0 0 1 1.54-.65c.6 0 1.1.22 1.54.65.43.43.65.94.65 1.54 0 .6-.22 1.1-.65 1.54a2.1 2.1 0 0 1-1.54.65H7.13a.9.9 0 0 0-.61.34.9.9 0 0 0-.24.4l-.23 1.37h9.06c.46 0 .86.15 1.2.44.35.3.56.66.64 1.09v.02l.96 5.21c0 .05 0 .1 0 .14 0 .08 0 .15-.02.22a1 1 0 0 1-.09.16ZM8.13 4.06c0-.26-.09-.48-.28-.66a.9.9 0 0 0-.66-.27c-.26 0-.48.09-.66.27a.9.9 0 0 0-.28.66c0 .26.09.48.28.66.18.18.4.27.66.27.26 0 .48-.09.66-.27.18-.18.27-.4.27-.66Zm7.5 0c0-.26-.09-.48-.27-.66a.9.9 0 0 0-.66-.27c-.26 0-.48.09-.66.27a.9.9 0 0 0-.27.66c0 .26.09.48.27.66.18.18.4.27.66.27.26 0 .48-.09.66-.27.18-.18.27-.4.27-.66Zm.31 5.82a.62.62 0 0 0-.61-.51H6.04l-.92 5h11.65l-.82-4.49Z"/></g></svg>'
  };

  /* ------------------------------------------------------------
     Estado interno
     ------------------------------------------------------------ */
  const estado = {
    aberto: false,
    gatilho: null, // elemento que abriu o drawer (foco volta pra ele)
    temporizadorCascata: null,
    linhasOcupadas: new Set() // chaves com requisicao em andamento
  };

  /* ------------------------------------------------------------
     Helpers genericos (funcoes puras / utilitarias)
     ------------------------------------------------------------ */
  const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

  const buscarTodos = (seletor, escopo) => Array.from((escopo || document).querySelectorAll(seletor));

  const painel = () => document.querySelector('[data-cart-drawer]');
  const overlay = () => document.querySelector('[data-cart-drawer-overlay]');
  const lista = () => document.querySelector('[data-cart-items]');

  const MAPA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapar = (valor) => String(valor === null || valor === undefined ? '' : valor).replace(/[&<>"']/g, (caractere) => MAPA_ESCAPE[caractere]);

  const formatarDinheiro = (centavos) =>
    (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: MOEDA });

  // A CDN do Shopify aceita ?width=N para servir a imagem no tamanho certo.
  const redimensionar = (url, largura) => {
    if (!url) return '';
    return url.includes('?') ? `${url}&width=${largura}` : `${url}?width=${largura}`;
  };

  const avisar = (mensagem, tipo) => {
    if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(mensagem, tipo || 'positivo');
  };

  const avisarErro = (erro) => {
    avisar((erro && erro.message) || 'Nao foi possivel atualizar o carrinho.', 'negativo');
  };

  // Re-dispara a animacao mesmo se a classe ja estiver aplicada.
  const pulsar = (elemento) => {
    if (!elemento) return;
    elemento.classList.remove('is-bumping');
    void elemento.offsetWidth;
    elemento.classList.add('is-bumping');
    setTimeout(() => elemento.classList.remove('is-bumping'), DURACAO_PULSO);
  };

  /* ------------------------------------------------------------
     Requisicoes (Cart AJAX API)
     ------------------------------------------------------------ */
  async function buscarCarrinho() {
    const resposta = await fetch(URL_CARRINHO, { headers: { Accept: 'application/json' } });
    if (!resposta.ok) throw new Error('Nao foi possivel carregar o carrinho.');
    return resposta.json();
  }

  async function alterarLinha(chave, quantidade) {
    const resposta = await fetch(URL_ALTERAR, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chave, quantity: Math.max(0, quantidade) })
    });

    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      throw new Error((dados && (dados.description || dados.message)) || 'Nao foi possivel atualizar o item.');
    }
    return dados;
  }

  /* ------------------------------------------------------------
     Contadores (header + drawer) e subtotal
     ------------------------------------------------------------ */
  function atualizarContadores(quantidade, comPulso) {
    buscarTodos('[data-cart-count]').forEach((elemento) => {
      elemento.textContent = quantidade;
      if (comPulso) pulsar(elemento);
    });

    if (comPulso) {
      pulsar(document.querySelector('.header__cart'));
      pulsar(document.querySelector('[data-cart-subtotal]'));
    }
  }

  /* ------------------------------------------------------------
     Render da lista de itens
     ------------------------------------------------------------ */
  function montarItem(item, indice) {
    const linha = indice + 1;
    const titulo = escapar(item.product_title || item.title);
    const url = escapar(item.url || '#');
    const chave = escapar(item.key);
    const variante = escapar(item.variant_id || item.id);
    const temVariante = item.variant_title && item.variant_title !== 'Default Title';

    const imagem = item.image
      ? `<img class="cart-drawer__item-image" src="${escapar(redimensionar(item.image, 200))}" alt="${titulo}" width="100" height="100" loading="lazy">`
      : `<span class="cart-drawer__item-image cart-drawer__item-image--vazia">${ICONES.bag}</span>`;

    return [
      `<li class="cart-drawer__item" data-cart-line="${linha}" data-cart-line-key="${chave}" data-variant-id="${variante}" data-cart-unit-price="${Number(item.price) || 0}">`,
      `<a class="cart-drawer__item-image-link" href="${url}" tabindex="-1" aria-hidden="true">${imagem}</a>`,
      '<div class="cart-drawer__item-info">',
      `<h3 class="cart-drawer__item-title"><a class="cart-drawer__item-link" href="${url}">${titulo}</a></h3>`,
      temVariante ? `<p class="cart-drawer__item-variant">${escapar(item.variant_title)}</p>` : '',
      `<p class="cart-drawer__item-price" data-cart-line-price>${formatarDinheiro(item.final_line_price)}</p>`,
      '<div class="cart-drawer__item-actions">',
      '<div class="cart-drawer__qty">',
      `<button type="button" class="cart-drawer__qty-button" data-cart-qty-decrease data-line="${linha}" aria-label="Diminuir quantidade de ${titulo}">${ICONES.minus}</button>`,
      `<label class="cart-drawer__qty-label visually-hidden" for="cart-qty-${linha}">Quantidade de ${titulo}</label>`,
      `<input class="cart-drawer__qty-input" id="cart-qty-${linha}" type="tel" inputmode="numeric" pattern="[0-9]*" value="${Number(item.quantity) || 0}" data-cart-qty-input data-line="${linha}" data-variant-id="${variante}" spellcheck="false" autocomplete="off">`,
      `<button type="button" class="cart-drawer__qty-button" data-cart-qty-increase data-line="${linha}" aria-label="Aumentar quantidade de ${titulo}">${ICONES.plus}</button>`,
      '</div>',
      `<button type="button" class="cart-drawer__item-remove" data-cart-remove data-line="${linha}" data-variant-id="${variante}" aria-label="Remover ${titulo} do carrinho">${ICONES.trash}</button>`,
      '</div>',
      '</div>',
      '</li>'
    ].join('');
  }

  function renderCartItems(cart, opcoes) {
    const config = opcoes || {};
    const quantidade = (cart && cart.item_count) || 0;

    // Pulso: forcado no add-to-cart, automatico quando a contagem muda e
    // desligado nas sincronizacoes silenciosas (load / bfcache).
    const referencia = document.querySelector('[data-cart-count]');
    const anterior = referencia ? parseInt(referencia.textContent, 10) : null;
    const comPulso = config.silencioso ? false : config.forcarPulso === true || anterior !== quantidade;

    atualizarContadores(quantidade, comPulso);

    const container = lista();
    if (!container) return; // pagina sem o snippet do drawer

    const vazio = document.querySelector('[data-cart-empty]');
    const rodape = document.querySelector('[data-cart-footer]');
    const subtotal = document.querySelector('[data-cart-subtotal]');
    const itens = (cart && cart.items) || [];

    if (quantidade === 0 || itens.length === 0) {
      container.innerHTML = '';
      if (vazio) vazio.hidden = false;
      if (rodape) rodape.hidden = true;
      return;
    }

    // Chaves ja visiveis: so o que e novo ganha a animacao de entrada.
    const anteriores = new Set(
      buscarTodos('[data-cart-line-key]', container).map((linha) => linha.getAttribute('data-cart-line-key'))
    );

    // Durante a cascata de abertura o proprio CSS ja anima tudo em sequencia;
    // aplicar --enter aqui brigaria com ela.
    const emCascata = Boolean(painel() && painel().classList.contains('is-open'));

    container.innerHTML = itens.map(montarItem).join('');

    if (!emCascata) {
      buscarTodos('[data-cart-line-key]', container).forEach((linha) => {
        if (anteriores.has(linha.getAttribute('data-cart-line-key'))) return;
        linha.classList.add('cart-drawer__item--enter');
        setTimeout(() => linha.classList.remove('cart-drawer__item--enter'), DURACAO_ENTRADA);
      });
    }

    if (subtotal) subtotal.textContent = formatarDinheiro(cart.total_price);
    if (vazio) vazio.hidden = true;
    if (rodape) rodape.hidden = false;
  }

  /* ------------------------------------------------------------
     Abrir / fechar o drawer
     ------------------------------------------------------------ */
  function abrirDrawer(gatilho) {
    const alvo = painel();
    if (!alvo || estado.aberto) return;

    estado.aberto = true;
    estado.gatilho = gatilho || document.activeElement;

    document.body.classList.add('cart-drawer-open');
    alvo.classList.add('is-open');
    if (overlay()) overlay().classList.add('is-open');
    alvo.setAttribute('aria-hidden', 'false');
    buscarTodos('[data-cart-drawer-open]').forEach((el) => el.setAttribute('aria-expanded', 'true'));

    // A cascata de entrada so vale na abertura; depois sai de cena para
    // nao re-animar a lista a cada alteracao de quantidade.
    clearTimeout(estado.temporizadorCascata);
    estado.temporizadorCascata = setTimeout(() => alvo.classList.remove('is-open'), DURACAO_CASCATA);

    window.requestAnimationFrame(() => alvo.focus());
  }

  function fecharDrawer() {
    const alvo = painel();
    if (!alvo || !estado.aberto) return;

    estado.aberto = false;
    clearTimeout(estado.temporizadorCascata);

    document.body.classList.remove('cart-drawer-open');
    alvo.classList.remove('is-open');
    if (overlay()) overlay().classList.remove('is-open');
    alvo.setAttribute('aria-hidden', 'true');
    buscarTodos('[data-cart-drawer-open]').forEach((el) => el.setAttribute('aria-expanded', 'false'));

    if (estado.gatilho && document.contains(estado.gatilho)) estado.gatilho.focus();
    estado.gatilho = null;
  }

  // Mantem o Tab dentro do dialog enquanto ele estiver aberto.
  function prenderFoco(evento) {
    const alvo = painel();
    if (!alvo) return;

    const focaveis = buscarTodos(SELETOR_FOCAVEL, alvo).filter((el) => el.offsetParent !== null);
    if (focaveis.length === 0) {
      evento.preventDefault();
      alvo.focus();
      return;
    }

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = document.activeElement;

    if (evento.shiftKey && (ativo === primeiro || ativo === alvo)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && ativo === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  /* ------------------------------------------------------------
     Acoes de linha (quantidade / remover)
     ------------------------------------------------------------ */
  function bloquearLinha(linha, bloqueado) {
    if (!linha || !document.contains(linha)) return;
    buscarTodos('button, input', linha).forEach((el) => {
      el.disabled = bloqueado;
    });
    linha.setAttribute('aria-busy', bloqueado ? 'true' : 'false');
  }

  async function ressincronizar() {
    try {
      renderCartItems(await buscarCarrinho(), { silencioso: true });
    } catch (erro) {
      // Se nem o /cart.js responde, deixamos a UI como esta.
    }
  }

  // Atualiza os numeros na tela na hora do clique, sem esperar o servidor
  // confirmar (o /cart/change.js real acontece em paralelo, em
  // aplicarQuantidade). Reconstroi contadores e subtotal somando o que
  // ja esta visivel no drawer, usando data-cart-unit-price de cada linha.
  function atualizarLinhaOtimista(linha, quantidade) {
    if (!linha) return;

    const campo = linha.querySelector('[data-cart-qty-input]');
    if (campo) campo.value = quantidade;

    const precoUnitario = Number(linha.getAttribute('data-cart-unit-price')) || 0;
    const precoLinha = linha.querySelector('[data-cart-line-price]');
    if (precoLinha) precoLinha.textContent = formatarDinheiro(precoUnitario * quantidade);

    let totalItens = 0;
    let totalCentavos = 0;
    buscarTodos('[data-cart-line-key]', lista()).forEach((outraLinha) => {
      const qtd = outraLinha === linha
        ? quantidade
        : parseInt((outraLinha.querySelector('[data-cart-qty-input]') || {}).value, 10) || 0;
      const unitario = Number(outraLinha.getAttribute('data-cart-unit-price')) || 0;
      totalItens += qtd;
      totalCentavos += qtd * unitario;
    });

    const subtotal = document.querySelector('[data-cart-subtotal]');
    if (subtotal) subtotal.textContent = formatarDinheiro(totalCentavos);

    atualizarContadores(totalItens, true);
  }

  async function aplicarQuantidade(linha, quantidade) {
    const chave = linha && linha.getAttribute('data-cart-line-key');
    if (!chave || estado.linhasOcupadas.has(chave)) return;

    estado.linhasOcupadas.add(chave);
    bloquearLinha(linha, true);

    try {
      renderCartItems(await alterarLinha(chave, quantidade));
    } catch (erro) {
      avisarErro(erro);
      await ressincronizar();
    } finally {
      estado.linhasOcupadas.delete(chave);
      bloquearLinha(linha, false);
    }
  }

  async function removerItem(linha) {
    const chave = linha && linha.getAttribute('data-cart-line-key');
    if (!chave || estado.linhasOcupadas.has(chave)) return;

    estado.linhasOcupadas.add(chave);
    bloquearLinha(linha, true);
    linha.classList.add('cart-drawer__item--leave');

    await esperar(DURACAO_SAIDA);

    try {
      renderCartItems(await alterarLinha(chave, 0));
    } catch (erro) {
      linha.classList.remove('cart-drawer__item--leave');
      avisarErro(erro);
      await ressincronizar();
    } finally {
      estado.linhasOcupadas.delete(chave);
      bloquearLinha(linha, false);
    }
  }

  /* ------------------------------------------------------------
     Add-to-cart (intercepta o formulario de produto)
     ------------------------------------------------------------ */
  async function aoEnviarFormulario(evento) {
    const formulario = evento.target;
    if (!formulario.matches(SELETOR_FORM_ADD)) return;

    evento.preventDefault();
    const botao = formulario.querySelector('[type="submit"], [name="add"]');
    if (botao) botao.setAttribute('aria-busy', 'true');

    let adicionado = false;

    try {
      const resposta = await fetch(URL_ADICIONAR, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(formulario)
      });
      if (!resposta.ok) throw new Error('add failed');
      await resposta.json();
      adicionado = true;

      if (painel()) {
        // Abre o drawer JA, sem esperar o /cart.js: a cascata do CSS comeca
        // a animar na hora, e a lista so entra assim que o fetch responder
        // (roda em paralelo com a animacao de abertura, nao depois dela).
        abrirDrawer(botao);
        renderCartItems(await buscarCarrinho(), { forcarPulso: true });
      } else {
        const cart = await buscarCarrinho();
        atualizarContadores(cart.item_count, true);
        avisar((window.themeStrings && window.themeStrings.addedToCart) || 'Adicionado ao carrinho', 'positivo');
      }
    } catch (erro) {
      // Falhou o proprio add: volta para o envio tradicional do formulario.
      if (!adicionado) {
        formulario.submit();
        return;
      }
      // Adicionou, mas nao conseguimos atualizar a UI: avisa sem travar nada.
      avisarErro(erro);
    } finally {
      if (botao) botao.removeAttribute('aria-busy');
    }
  }

  /* ------------------------------------------------------------
     Delegacao de eventos
     ------------------------------------------------------------ */
  function aoClicar(evento) {
    const origem = evento.target instanceof Element ? evento.target : null;
    if (!origem) return;

    const abrir = origem.closest('[data-cart-drawer-open]');
    if (abrir) {
      evento.preventDefault();
      abrirDrawer(abrir);
      return;
    }

    // Fechar: nao usamos preventDefault porque um dos gatilhos e um link
    // ("Escolher meu kit") e a navegacao precisa continuar.
    if (origem.closest('[data-cart-drawer-close], [data-cart-drawer-overlay]')) {
      fecharDrawer();
      return;
    }

    const linha = origem.closest('[data-cart-line-key]');

    if (origem.closest('[data-cart-remove]')) {
      removerItem(linha);
      return;
    }

    const diminuir = origem.closest('[data-cart-qty-decrease]');
    const aumentar = origem.closest('[data-cart-qty-increase]');

    if (diminuir || aumentar) {
      const chave = linha && linha.getAttribute('data-cart-line-key');
      if (!chave || estado.linhasOcupadas.has(chave)) return;

      const campo = linha.querySelector('[data-cart-qty-input]');
      const atual = campo ? parseInt(campo.value, 10) || 0 : 0;
      const novo = atual + (aumentar ? 1 : -1);

      if (novo <= 0) {
        removerItem(linha);
      } else {
        atualizarLinhaOtimista(linha, novo);
        aplicarQuantidade(linha, novo);
      }
      return;
    }

    // Qualquer link de navegacao do drawer fecha o painel (sem bloquear o clique).
    if (estado.aberto && origem.closest('[data-cart-drawer] a[href]')) fecharDrawer();
  }

  function aoAlterarCampo(evento) {
    const campo = evento.target instanceof Element ? evento.target.closest('[data-cart-qty-input]') : null;
    if (!campo) return;

    const linha = campo.closest('[data-cart-line-key]');
    const quantidade = parseInt(campo.value, 10);

    if (Number.isNaN(quantidade) || quantidade < 0) {
      ressincronizar();
      return;
    }

    const chave = linha && linha.getAttribute('data-cart-line-key');
    if (!chave || estado.linhasOcupadas.has(chave)) return;

    if (quantidade === 0) {
      removerItem(linha);
      return;
    }

    atualizarLinhaOtimista(linha, quantidade);
    aplicarQuantidade(linha, quantidade);
  }

  function aoTeclar(evento) {
    if (!estado.aberto) return;

    if (evento.key === 'Escape') {
      fecharDrawer();
      return;
    }

    if (evento.key === 'Tab') {
      prenderFoco(evento);
      return;
    }

    // Enter no campo de quantidade confirma sem esperar o blur.
    const campo = evento.target instanceof Element ? evento.target.closest('[data-cart-qty-input]') : null;
    if (evento.key === 'Enter' && campo) {
      evento.preventDefault();
      campo.blur();
    }
  }

  /* ------------------------------------------------------------
     Sincronizacao no carregamento
     ------------------------------------------------------------ */
  async function refreshCartCount() {
    try {
      const cart = await buscarCarrinho();
      const contador = document.querySelector('[data-cart-count]');
      const renderizado = contador ? parseInt(contador.textContent, 10) : null;

      // O HTML ja vem correto do servidor; so reconstruimos a lista se o
      // carrinho mudou por fora (outra aba, cache de navegacao, bfcache).
      if (renderizado !== cart.item_count) {
        renderCartItems(cart, { silencioso: true });
      } else {
        atualizarContadores(cart.item_count, false);
      }
    } catch (erro) {
      // Sem rede: mantem o que o servidor renderizou.
    }
  }

  /* ------------------------------------------------------------
     Inicializacao
     ------------------------------------------------------------ */
  document.addEventListener('submit', aoEnviarFormulario);
  document.addEventListener('click', aoClicar);
  document.addEventListener('change', aoAlterarCampo);
  document.addEventListener('keydown', aoTeclar);
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) refreshCartCount();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshCartCount);
  } else {
    refreshCartCount();
  }

  window.cartDrawer = {
    abrir: abrirDrawer,
    fechar: fecharDrawer,
    atualizar: ressincronizar,
    renderizar: renderCartItems
  };
})();
