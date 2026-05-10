<?php
if (!defined('ABSPATH')) {
    exit;
}

get_header();
?>
<main class="site-main">
    <div class="wfwc-theme-shell">
        <section class="site-content-card">
            <?php if (have_posts()) : ?>
                <?php while (have_posts()) : the_post(); ?>
                    <article <?php post_class(); ?>>
                        <header class="entry-header">
                            <h1 class="entry-title"><?php the_title(); ?></h1>
                        </header>
                        <div class="entry-content">
                            <?php the_content(); ?>
                        </div>
                    </article>
                <?php endwhile; ?>
            <?php else : ?>
                <article class="page type-page status-publish">
                    <header class="entry-header">
                        <h1 class="entry-title">Wimifarma</h1>
                    </header>
                    <div class="entry-content">
                        <p>O tema esta ativo, mas ainda nao ha conteudo publicado para esta pagina.</p>
                    </div>
                </article>
            <?php endif; ?>
        </section>
    </div>
</main>
<?php
get_footer();
