<?php
if (!defined('ABSPATH')) {
    exit;
}

get_header();
?>
<main class="site-main">
    <div class="wfwc-theme-shell">
        <section class="site-content-card">
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
        </section>
    </div>
</main>
<?php
get_footer();
