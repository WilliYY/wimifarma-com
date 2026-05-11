<?php
if (!defined('ABSPATH')) {
    exit;
}

get_header();
?>

<main class="site-main">
    <section class="wfwc-home-launchpad">
        <video class="wfwc-home-video" autoplay muted loop playsinline preload="metadata" aria-hidden="true">
            <source src="<?php echo esc_url(wfwc_theme_asset_url('assets/video/looping.mp4')); ?>" type="video/mp4">
        </video>
        <img class="wfwc-home-runner wfwc-nyan-runner" src="<?php echo esc_url(wfwc_theme_asset_url('assets/img/nyan.gif')); ?>" alt="" aria-hidden="true" data-wfwc-runner data-runner-kind="nyan" data-miauby-screen-object="gato voador" data-miauby-screen-label="gato voador de arco-iris na home">
        <img class="wfwc-home-runner wfwc-duck-runner" src="<?php echo esc_url(wfwc_theme_asset_url('assets/img/pato.gif')); ?>" alt="" aria-hidden="true" data-wfwc-runner data-runner-kind="duck" data-miauby-screen-object="pato" data-miauby-screen-label="pato fiscal zanzando na home">
        <img class="wfwc-home-runner wfwc-dragon-runner" src="<?php echo esc_url(wfwc_theme_asset_url('assets/img/toothless.gif')); ?>" alt="" aria-hidden="true" data-wfwc-runner data-runner-kind="dragon" data-miauby-screen-object="dragao" data-miauby-screen-label="dragao Toothless patrulhando a home">
        <div class="wfwc-theme-shell">
            <div class="wfwc-home-intro wfwc-home-intro-brand">
                <h1 data-wfwc-magnetic-title aria-label="Wimifarma">
                    <span class="wfwc-title-letter" style="--letter-index: 0;" aria-hidden="true">W</span>
                    <span class="wfwc-title-letter" style="--letter-index: 1;" aria-hidden="true">i</span>
                    <span class="wfwc-title-letter" style="--letter-index: 2;" aria-hidden="true">m</span>
                    <span class="wfwc-title-letter" style="--letter-index: 3;" aria-hidden="true">i</span>
                    <span class="wfwc-title-letter" style="--letter-index: 4;" aria-hidden="true">f</span>
                    <span class="wfwc-title-letter" style="--letter-index: 5;" aria-hidden="true">a</span>
                    <span class="wfwc-title-letter" style="--letter-index: 6;" aria-hidden="true">r</span>
                    <span class="wfwc-title-letter" style="--letter-index: 7;" aria-hidden="true">m</span>
                    <span class="wfwc-title-letter" style="--letter-index: 8;" aria-hidden="true">a</span>
                </h1>
            </div>

            <div class="wfwc-module-grid" aria-label="Sistemas Wimifarma">
                <article class="wfwc-module-card" data-module-card="cashback">
                    <h2>Cashback</h2>
                    <p>Cadastro de cliente, compra, recompra e controle de saldo.</p>
                    <a class="wfwc-home-btn is-secondary" href="<?php echo esc_url(wfwc_home_url('/cashback/')); ?>">Entrar</a>
                </article>

                <article class="wfwc-module-card" data-module-card="cotacao">
                    <h2>Cotacao</h2>
                    <p>Area reservada para pesquisa por EAN, produto e fornecedor.</p>
                    <a class="wfwc-home-btn is-secondary" href="<?php echo esc_url(wfwc_home_url('/cotacao/')); ?>">Entrar</a>
                </article>

                <article class="wfwc-module-card" data-module-card="financeiro">
                    <h2>Financeiro</h2>
                    <p>Fechamento de caixa, sangrias, maquininhas e PIX.</p>
                    <a class="wfwc-home-btn is-secondary" href="<?php echo esc_url(wfwc_home_url('/financeiro/')); ?>">Entrar</a>
                </article>

                <article class="wfwc-module-card" data-module-card="tarefa">
                    <strong class="wfwc-module-badge" data-task-count hidden>0</strong>
                    <h2>Tarefas</h2>
                    <p>Prioridades abertas, conclusoes e historico operacional.</p>
                    <a class="wfwc-home-btn is-secondary" href="<?php echo esc_url(wfwc_home_url('/tarefa/')); ?>">Entrar</a>
                </article>

                <article class="wfwc-module-card" data-module-card="miauby">
                    <h2>Miauby</h2>
                    <p>Fiscal interno para alertas, ideias, processos e comando operacional.</p>
                    <a class="wfwc-home-btn is-secondary" href="<?php echo esc_url(wfwc_home_url('/miauw/')); ?>">Entrar</a>
                </article>
            </div>
        </div>
    </section>
</main>

<?php get_footer(); ?>
