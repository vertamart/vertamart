-- Perfiles públicos migrados desde la instalación local.
-- Las contraseñas y sesiones no se migran por seguridad.
INSERT OR IGNORE INTO users (id,name,email,password_hash,role,country)
VALUES
(3,'Raúl','rcarrascosabegara@gmail.com','!migrated-no-password-3','customer','ES'),
(4,'Administrador','admin@vertamart.cl','!migrated-no-password-4','admin','ES');

-- Publicaciones reales locales. Likes y comentarios permanecen en cero porque no se inventan.
INSERT OR IGNORE INTO feed_posts (id,user_id,product_id,title,description,video_url,likes_count,created_at)
VALUES
(1,4,'7','Setup premium para trabajar mejor','Descubre cómo mejorar tu escritorio con accesorios Verta.','https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4',0,'2026-08-28 10:07:11'),
(2,4,'8','Audio para todos tus viajes','Sonido limpio, batería larga y cancelación de ruido.','https://videos.pexels.com/video-files/853800/853800-hd_1920_1080_25fps.mp4',0,'2026-08-28 10:07:11'),
(3,4,NULL,'Mi setup gaming actualizado','Una configuración cómoda para jugar y crear contenido.','https://videos.pexels.com/video-files/3205627/3205627-hd_1920_1080_25fps.mp4',0,'2026-08-28 10:07:11'),
(5,4,'11','Reloj nuevo','Es muy usable me encanta me lo regaló mi abuelo.','https://videos.pexels.com/video-files/4761732/4761732-hd_1920_1080_25fps.mp4',0,'2026-08-28 12:57:42'),
(7,3,NULL,'Test','Test','https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4',0,'2026-08-28 14:00:17');
