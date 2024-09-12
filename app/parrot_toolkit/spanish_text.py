HOME_TITLE = "¡Bienvenido al Loro Calvinista!"

HOME_INTRO = """\
¡Bienvenido! Estoy aquí para guiarte a través de la Biblia desde una perspectiva Reformada. Siéntete libre de preguntarme cualquier cosa sobre las Escrituras, y te proporcionaré información basada en mi conocimiento y entendimiento como Bautista Reformado.

Como una aplicación impulsada por IA, proporciono múltiples herramientas que recopilan información de fuentes como la [Biblioteca Etérea de Clásicos Cristianos](https://ccel.org) y [Bible Hub](https://biblehub.com/commentaries) para enriquecer tu tiempo en la Biblia.

Aunque no puedo usar la ESV debido a restricciones, confiamos en la Biblia Estándar Berea ([BSB](https://berean.bible/)) como nuestra traducción principal. Aprende más sobre la BSB [aquí](https://copy.church/initiatives/bibles/) y únete a nosotros en el descubrimiento de la riqueza de su texto.\
"""

QUICK_CHAT_TITLE = "Chat Rápido"

QUICK_CHAT_INTRO = """\
¡Podemos empezar de inmediato! ¿Tienes una pregunta rápida? Esta versión utiliza un GPT-4o-mini Ajustado con el Catecismo Bautista para generar respuestas. ¡Siéntete libre de preguntarme cualquier cosa!
"""

QC_BUTTON = "Preguntar"
QC_FOLLOW_UP = "Por favor, elabora"
QC_RESET = "Nueva Pregunta"

HOME_MENU_INTRO = """\
Explora las herramientas disponibles en el menú de la izquierda:

- **Loro Calvinista**: Participa en discusiones y preguntas sobre la Biblia desde una perspectiva Reformada. 
    - Modo Principal: El Loro, Calvino y un Bibliotecario de la CCEL están aquí para ayudarte a aprender y crecer en tu entendimiento de las Escrituras.
    - Modo Breve: Accede a una versión simplificada del modo principal sin iniciar sesión. Podrás hablar con el Loro y Calvino.
- **CCEL**: Sumérgete en los tesoros de la [Biblioteca Etérea de Clásicos Cristianos](https://ccel.org) para escritos cristianos atemporales.
- **Asistente de Estudio**: Accede a comentarios de [Bible Hub](https://biblehub.com/commentaries) para enriquecer tu estudio de las Escrituras.
- **Devocionales**: Comienza o termina tu día con reflexiones matutinas y vespertinas generadas por IA para consuelo e inspiración.
"""
# - **Revisión de Sermones**: Evalúa tus sermones utilizando el marco de predicación centrada en Cristo de Bryan Chappell.\

HOME_FOOTER = """\
- Actualizaciones de septiembre de 2024: 
    - Se ha añadido una nueva función de preguntas y respuestas rápidas en la página de inicio. Ahora puedes hacer preguntas rápidas al Loro Calvinista, no se requiere inicio de sesión.
    - El Loro principal ahora tiene un modo breve. ¡Puedes acceder a él sin iniciar sesión también! Para acceder al modo principal, por favor inicia sesión.
- Actualización de agosto de 2024: Si tienes Instagram, puedes tener una charla rápida con mi versión Llama en:
    - [Loro Calvinista IG](https://aistudio.instagram.com/ai/1182100252914420/?utm_source=share)
- Actualización de julio de 2024: ¡Por favor, da la bienvenida a la versión en español del Loro Calvinista! 
    - [El Loro Calvinista](https://lorocalvinista.com/). La version original en inglés es [Calvinist Parrot](https://calvinistparrot.com/)
- Actualización de junio de 2024: ¡La herramienta de CCEL está de vuelta!

Advertencia: La gestión de sesiones es un poco irregular. Estoy trabajando en ello. iOS no se lleva muy bien con las sesiones. Lo siento por las molestias.

¡Todavía estoy aprendiendo, así que por favor ten paciencia conmigo! Siempre estoy buscando mejorar, así que si tienes algún comentario, <a href='mailto:jesus@jgmancilla.com'>por favor házmelo saber</a>

También soy de código abierto, así que si estás interesado en contribuir a mi desarrollo, visita mi [GitHub](https://github.com/Jegama/calvinist-parrot)\
"""

pages = [
    "Loro Calvinista",
    "Asistente de Estudio",
    "Devocionales",
    "Revisión de Sermones",
    "Estudios Bíblicos",
    "Iniciar sesión",
    "Registrarse",
    "Cerrar sesión"
]

# Menú lateral
CLEAR_CHAT = "Nueva Conversación"
LOGGED_AS = "Conectado como"
CHAT_HIST = "Historial de Conversación"
NOT_LOGGED = "Por favor, inicie sesión para ver su historial de conversaciones"
NO_HIST = "Aún no hay conversaciones. ¡Espero con ansias charlar contigo!"

# Relacionado con el chat
CONSULTED_SOURCES = "📚 **Fuentes Consultadas**"
CHAT_FIRST_MESSAGE = "¿Qué preguntas teológicas tienes?"
CHAT_PLACESHOLDER = "¿Qué es la predestinación?"
CHAT_NOT_LOGGED = "Por favor, use la barra lateral para iniciar sesión o registrarse."

chat_modes = ["Principal", "Breve"]

PAROT_BRIEF_ONLY_HEADER = "Modo Breve - Para acceder a otros modos, por favor inicie sesión."
PARROT_BRIEF_HEADER = "Modo Breve"
PARROT_MAIN_HEADER = "Modo Principal"

# Errores
ERROR_CREATING_CONVERSATION = "Error al actualizar o crear conversación"
ERROR_GETTING_HISTORY = "Error al obtener el historial de conversaciones"
ERROR_CREATE_USER = "Error al crear usuario"

# CCEL
CCEL_FIRST_MESSAGE = "¿Qué quieres aprender?"

# Asistente de Estudio
SH_EXPANDER = "📚 **Información adicional**"
SH_EXPANDER_SOURCE = "Fuente"
SH_FIRST = "¿Qué pasaje quieres estudiar?"
SH_PLACEHOLDER_VERSE = "Romanos 9:14-18"
SH_PLACEHOLDER = "¿Puedes ayudarme a entender este pasaje?"
SH_SPINNER = "Obteniendo comentarios..."
SH_CHECK_NONE = "Lo siento, no pude encontrar referencias en tu entrada. Por favor, inténtalo de nuevo."
SH_CHECK_INDEXING = "Indexando comentarios..."
SH_CHECK_SUCCESS = "¡Comentarios indexados! ¿Qué pregunta tienes?"
SH_SPINNER_QUERY = "Pensando..."
SH_NO_QUERY_ENGINE = "❌ - No tenemos un motor de consultas..."
SH_YES_QUERY_ENGINE = "✅ - ¡Tenemos un motor de consultas activo!"

# Devocionales
DEVOTIONALS_SPINNER = "Generando..."
DEVOTIONALS_FOOTER = "Este devocional fue generado por IA. Si tienes alguna pregunta o comentario, por favor envía un correo a [Jesús Mancilla](mailto:jesus@jgmancilla.com)"
DEVOTIONALS_EXPANDER = "📰 **Información adicional**"
DEVOTIONALS_EXPANDER_TITLE = "Artículos de noticias utilizados para generar este devocional:"

# Revisión de Sermones
SR_SIDE_NO_REVIEWS = "Aún no has revisado ningún sermón."
SR_SIDE_NEW_REVIEW = "Nueva Revisión"
SR_DOWNLOAD_REVIEW = "Descargar Revisión"
SR_SPINNER_1 = "Generando la primera sección... Esto toma al menos 30 segundos."
SR_1_SUCCESS = "Primera sección generada con éxito."
SR_1_FAIL = "Error al generar la primera sección."
SR_SPINNER_2 = "Generando la segunda sección... Esto toma al menos 30 segundos."
SR_2_SUCCESS = "Segunda sección generada con éxito."
SR_2_FAIL = "Error al generar la segunda sección."
SR_NEW_REVIEW_HEADER = "¿Qué sermón te gustaría revisar hoy?"
SR_NEW_REVIEW_INTRO = "El Loro Calvinista utiliza el marco de evaluación de Bryan Chappell de su libro, Predicación Centrada en Cristo, para evaluar sermones."
SR_SERMON_TITLE = "Introduce el título del sermón"
SR_PREACHER = "Introduce el nombre del predicador"
SR_TRANSCRIPT = "Introduce la transcripción del sermón"
SR_GENERATE_BUTTON = "Generar Revisión"
SR_NOT_ALL_FIELDS = "Por favor, complete todos los campos."
SR_TRANSCRIPT_TOO_SHORT = "La transcripción es demasiado corta. ¿Estás seguro de que es el sermón completo?"

# Iniciar sesión
LOGIN_WELCOME = "Para aprovechar al máximo el Loro Calvinista, por favor inicie sesión. Si no tiene una cuenta, puede registrarse gratis."
LOGIN_USERNAME = "Nombre de usuario"
LOGIN_PASSWORD = "Contraseña"
LOGIN_BUTTON = "Iniciar sesión"

# Registrarse
REGISTER_WELCOME = "Regístrese gratis para acceder a todas las funciones del Loro Calvinista."
REGISTER_USERNAME_PLACEHOLDER = "Este será tu nombre de usuario"
REGISTER_NAME = "Nombre"
REGISTER_NAME_HELP = "El loro usará este nombre para referirse a ti"
REGISTER_NAME_PLACEHOLDER = "Juan Pérez"
REGISTER_PASSWORD_HELP = "Por favor, usa una contraseña fuerte"
REGISTER_LANGUAGE = "Idioma preferido"
REGISTER_BUTTON = "Registrarse"
languages = ["Español", "Inglés"]
