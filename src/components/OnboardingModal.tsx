import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Wallet,
  Receipt,
  ShoppingBag,
  Settings,
  ChevronRight,
  ChevronLeft,
  Check,
  CheckCircle2,
  Circle,
  Bell,
  Calendar,
  Pencil,
  ShieldCheck,
  Sun,
  Moon,
  Globe,
  Coins,
  Smartphone,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  ArrowDown,
  Lightbulb,
} from 'lucide-react';
import { JarIcon } from './JarIcon';
import { getTranslations } from '../utils/languages';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
}

interface HighlightItem {
  title: string;
  desc: string;
  icon: React.ElementType;
}

interface StepInfo {
  id: number;
  tabLabel: string;
  icon: React.ElementType;
  title: string;
  description: string;
  highlights: HighlightItem[];
  tip?: string;
}

interface GuideUiCopy {
  headerTitle: string;
  step1Disclaimer: string;
  step1DemoEditHint: string;
  step1DemoConfirmHint: string;
  step1DemoAmount: string;
  step1DemoVariableAmount: string;
  step2DemoConcept: string;
  step2DemoAmount: string;
  step2DemoDueLabel: string;
  step2DemoToggleHint: string;
  step2AlertRangeNote: string;
  step3DemoExtraDaysCount: string;
  step3DemoWeekDaysCount: string;
  step3ToggleHint: string;
  step4ExampleText: string;
  step4DemoMerchant: string;
  step4DemoCategory: string;
  step4DemoAmount: string;
  step4DemoBefore: string;
  step4DemoAfter: string;
  step4OverbudgetNote: string;
  step5ClosingMessage: string;
  step5Items: { title: string; desc: string }[];
}

const GUIDE_UI_MAP: Record<string, GuideUiCopy> = {
  es: {
    headerTitle: 'Guía de Uso de NITA',
    step1Disclaimer:
      'NITA es una herramienta de organización. No administra tu dinero ni realiza operaciones financieras por vos. Vos ingresás tus datos y decidís cómo utilizar tu dinero.',
    step1DemoEditHint: 'Tocá el monto para editar',
    step1DemoConfirmHint: 'Confirmá con ✓ o Enter',
    step1DemoAmount: '$ 1.000.000',
    step1DemoVariableAmount: '$ 550.000',
    step2DemoConcept: 'Internet / Servicios',
    step2DemoAmount: '$ 45.000',
    step2DemoDueLabel: 'Vence día 10',
    step2DemoToggleHint: 'Tocá el círculo para probar',
    step2AlertRangeNote: 'Configurable de 1 a 30 días antes + el día del vencimiento',
    step3DemoExtraDaysCount: '3 días',
    step3DemoWeekDaysCount: '7 días',
    step3ToggleHint: 'Probá mover Días Extras:',
    step4ExampleText:
      'Compraste en el supermercado por $15.000. Registrás el importe y la categoría correspondiente. NITA actualiza el saldo del frasco al que pertenece ese movimiento.',
    step4DemoMerchant: 'Supermercado',
    step4DemoCategory: 'Alimentación',
    step4DemoAmount: '-$ 15.000',
    step4DemoBefore: '$ 60.000',
    step4DemoAfter: '$ 45.000',
    step4OverbudgetNote: 'Si superás el saldo, el frasco se marca en rojo para avisarte.',
    step5ClosingMessage:
      '¡Ya conocés las funciones principales de NITA! Ahora podés comenzar a organizar tus ingresos, gastos y ahorros. Recordá que NITA te ayuda a organizar tu información: las decisiones siempre son tuyas.',
    step5Items: [
      { title: 'Modo Blanco y Oscuro', desc: 'Cambiá el tema visual en cualquier momento.' },
      { title: 'Idioma y Moneda', desc: 'Elegí entre 7 idiomas y tu formato de moneda.' },
      { title: 'Avisos de vencimiento', desc: 'Activá alertas y definí cuántos días antes avisar.' },
      { title: 'Instalar y actualizar', desc: 'Instalá en dispositivos compatibles y buscá mejoras.' },
    ],
  },
  en: {
    headerTitle: 'NITA User Guide',
    step1Disclaimer:
      'NITA is an organization tool. It does not manage your money or execute financial transactions for you. You enter your own data and decide how to use your money.',
    step1DemoEditHint: 'Tap the amount to edit',
    step1DemoConfirmHint: 'Confirm with ✓ or Enter',
    step1DemoAmount: '$ 1,000,000',
    step1DemoVariableAmount: '$ 550,000',
    step2DemoConcept: 'Internet / Utilities',
    step2DemoAmount: '$ 45,000',
    step2DemoDueLabel: 'Due day 10',
    step2DemoToggleHint: 'Tap the circle to test',
    step2AlertRangeNote: 'Configurable from 1 to 30 days before + due day',
    step3DemoExtraDaysCount: '3 days',
    step3DemoWeekDaysCount: '7 days',
    step3ToggleHint: 'Try moving Extra Days:',
    step4ExampleText:
      'You spent $15,000 at the supermarket. You record the amount and its category. NITA updates the balance of the jar that movement belongs to.',
    step4DemoMerchant: 'Supermarket',
    step4DemoCategory: 'Groceries & Food',
    step4DemoAmount: '-$ 15,000',
    step4DemoBefore: '$ 60,000',
    step4DemoAfter: '$ 45,000',
    step4OverbudgetNote: 'If you exceed a jar budget, it highlights in red to alert you.',
    step5ClosingMessage:
      'You now know NITA’s core features! You can start organizing your income, expenses, and savings. Remember that NITA helps you organize your information: every decision is always yours.',
    step5Items: [
      { title: 'Light & Dark Mode', desc: 'Switch the visual theme anytime.' },
      { title: 'Language & Currency', desc: 'Choose from 7 languages and currency formats.' },
      { title: 'Due date alerts', desc: 'Toggle alerts and set how many days ahead to notify.' },
      { title: 'Install & updates', desc: 'Install on supported devices and check for updates.' },
    ],
  },
  ca: {
    headerTitle: 'Guia d’Ús de NITA',
    step1Disclaimer:
      'NITA és una eina d’organització. No administra els teus diners ni realitza operacions financeres per tu. Tu introdueixes les teves dades i decideixes com utilitzar els teus diners.',
    step1DemoEditHint: 'Toca l’import per editar',
    step1DemoConfirmHint: 'Confirma amb ✓ o Enter',
    step1DemoAmount: '$ 1.000.000',
    step1DemoVariableAmount: '$ 550.000',
    step2DemoConcept: 'Internet / Serveis',
    step2DemoAmount: '$ 45.000',
    step2DemoDueLabel: 'Venç dia 10',
    step2DemoToggleHint: 'Toca el cercle per provar',
    step2AlertRangeNote: 'Configurable d’1 a 30 dies abans + el dia del venciment',
    step3DemoExtraDaysCount: '3 dies',
    step3DemoWeekDaysCount: '7 dies',
    step3ToggleHint: 'Prova de moure Dies Extres:',
    step4ExampleText:
      'Vas comprar al supermercat per $15.000. Registres l’import i la categoria corresponent. NITA actualitza el saldo del pot al qual pertany aquest moviment.',
    step4DemoMerchant: 'Supermercat',
    step4DemoCategory: 'Alimentació',
    step4DemoAmount: '-$ 15.000',
    step4DemoBefore: '$ 60.000',
    step4DemoAfter: '$ 45.000',
    step4OverbudgetNote: 'Si superes el saldo, el pot es marca en vermell per avisar-te.',
    step5ClosingMessage:
      'Ja coneixes les funcions principals de NITA! Ara pots començar a organitzar els teus ingressos, despeses i estalvis. Recorda que NITA t’ajuda a organitzar la teva informació: les decisions sempre són teves.',
    step5Items: [
      { title: 'Mode Blanc i Fosc', desc: 'Canvia el tema visual en qualsevol moment.' },
      { title: 'Idioma i Moneda', desc: 'Tria entre 7 idiomes i el teu format de moneda.' },
      { title: 'Avisos de venciment', desc: 'Activa alertes i tria quants dies abans avisar.' },
      { title: 'Instal·lar i actualitzar', desc: 'Instal·la en dispositius compatibles i cerca millores.' },
    ],
  },
  pt: {
    headerTitle: 'Guia de Uso do NITA',
    step1Disclaimer:
      'O NITA é uma ferramenta de organização. Ele não administra seu dinheiro nem realiza operações financeiras por você. Você insere seus dados e decide como utilizar seu dinheiro.',
    step1DemoEditHint: 'Toque no valor para editar',
    step1DemoConfirmHint: 'Confirme com ✓ ou Enter',
    step1DemoAmount: '$ 1.000.000',
    step1DemoVariableAmount: '$ 550.000',
    step2DemoConcept: 'Internet / Serviços',
    step2DemoAmount: '$ 45.000',
    step2DemoDueLabel: 'Vence dia 10',
    step2DemoToggleHint: 'Toque no círculo para testar',
    step2AlertRangeNote: 'Configurável de 1 a 30 dias antes + no dia do vencimento',
    step3DemoExtraDaysCount: '3 dias',
    step3DemoWeekDaysCount: '7 dias',
    step3ToggleHint: 'Teste mover Dias Extras:',
    step4ExampleText:
      'Você comprou no supermercado por $15.000. Registra o valor e a categoria correspondente. O NITA atualiza o saldo do pote ao qual esse movimento pertence.',
    step4DemoMerchant: 'Supermercado',
    step4DemoCategory: 'Alimentação',
    step4DemoAmount: '-$ 15.000',
    step4DemoBefore: '$ 60.000',
    step4DemoAfter: '$ 45.000',
    step4OverbudgetNote: 'Se ultrapassar o limite, o pote é destacado em vermelho para alertar você.',
    step5ClosingMessage:
      'Você já conhece as principais funções do NITA! Agora pode começar a organizar sua renda, seus gastos e sua poupança. Lembre-se de que o NITA ajuda a organizar suas informações: as decisões são sempre suas.',
    step5Items: [
      { title: 'Modo Claro e Escuro', desc: 'Alterne o tema visual quando quiser.' },
      { title: 'Idioma e Moeda', desc: 'Escolha entre 7 idiomas e o formato de moeda.' },
      { title: 'Avisos de vencimento', desc: 'Ative alertas e defina quantos dias antes avisar.' },
      { title: 'Instalar e atualizar', desc: 'Instale em dispositivos compatíveis e busque atualizações.' },
    ],
  },
  fr: {
    headerTitle: 'Guide d’Utilisation de NITA',
    step1Disclaimer:
      'NITA est un outil d’organisation. Il ne gère pas votre argent et n’effectue aucune opération financière à votre place. Vous saisissez vos données et décidez comment utiliser votre argent.',
    step1DemoEditHint: 'Touchez le montant pour modifier',
    step1DemoConfirmHint: 'Validez avec ✓ ou Entrée',
    step1DemoAmount: '$ 1 000 000',
    step1DemoVariableAmount: '$ 550 000',
    step2DemoConcept: 'Internet / Services',
    step2DemoAmount: '$ 45 000',
    step2DemoDueLabel: 'Échéance le 10',
    step2DemoToggleHint: 'Touchez le cercle pour tester',
    step2AlertRangeNote: 'Configurable de 1 à 30 jours avant + le jour même',
    step3DemoExtraDaysCount: '3 jours',
    step3DemoWeekDaysCount: '7 jours',
    step3ToggleHint: 'Testez la position des Jours Supplémentaires :',
    step4ExampleText:
      'Vous avez fait des courses au supermarché pour 15 000 $. Vous saisissez le montant et la catégorie correspondante. NITA met à jour le solde du bocal concerné.',
    step4DemoMerchant: 'Supermarché',
    step4DemoCategory: 'Alimentation',
    step4DemoAmount: '-$ 15 000',
    step4DemoBefore: '$ 60 000',
    step4DemoAfter: '$ 45 000',
    step4OverbudgetNote: 'En cas de dépassement, le bocal s’affiche en rouge pour vous prévenir.',
    step5ClosingMessage:
      'Vous connaissez maintenant les principales fonctions de NITA ! Vous pouvez organiser vos revenus, vos dépenses et votre épargne. NITA vous aide à structurer vos informations : les décisions restent toujours les vôtres.',
    step5Items: [
      { title: 'Mode Clair et Sombre', desc: 'Changez le thème visuel à tout moment.' },
      { title: 'Langue et Devise', desc: 'Choisissez parmi 7 langues et formats de devise.' },
      { title: 'Alertes d’échéance', desc: 'Activez les rappels et définissez le délai d’avance.' },
      { title: 'Installer et mettre à jour', desc: 'Installez sur appareil compatible et vérifiez les mises à jour.' },
    ],
  },
  it: {
    headerTitle: 'Guida all’Uso di NITA',
    step1Disclaimer:
      'NITA è uno strumento di organizzazione. Non gestisce il tuo denaro né esegue operazioni finanziarie per te. Sei tu a inserire i dati e decidere come utilizzare il tuo denaro.',
    step1DemoEditHint: 'Tocca l’importo per modificare',
    step1DemoConfirmHint: 'Conferma con ✓ o Invio',
    step1DemoAmount: '$ 1.000.000',
    step1DemoVariableAmount: '$ 550.000',
    step2DemoConcept: 'Internet / Utenze',
    step2DemoAmount: '$ 45.000',
    step2DemoDueLabel: 'Scadenza giorno 10',
    step2DemoToggleHint: 'Tocca il cerchio per provare',
    step2AlertRangeNote: 'Configurabile da 1 a 30 giorni prima + il giorno della scadenza',
    step3DemoExtraDaysCount: '3 giorni',
    step3DemoWeekDaysCount: '7 giorni',
    step3ToggleHint: 'Prova a spostare i Giorni Extra:',
    step4ExampleText:
      'Hai fatto la spesa al supermercato per $15.000. Registri l’importo e la categoria corrispondente. NITA aggiorna il saldo del barattolo a cui appartiene quel movimento.',
    step4DemoMerchant: 'Supermercato',
    step4DemoCategory: 'Alimentari',
    step4DemoAmount: '-$ 15.000',
    step4DemoBefore: '$ 60.000',
    step4DemoAfter: '$ 45.000',
    step4OverbudgetNote: 'Se superi il saldo, il barattolo si evidenzia in rosso per avvisarti.',
    step5ClosingMessage:
      'Ora conosci le funzioni principali di NITA! Puoi iniziare a organizzare entrate, spese e risparmi. Ricorda che NITA ti aiuta a organizzare le tue informazioni: le decisioni sono sempre tue.',
    step5Items: [
      { title: 'Tema Chiaro e Scuro', desc: 'Cambia il tema visivo in qualsiasi momento.' },
      { title: 'Lingua e Valuta', desc: 'Scegli tra 7 lingue e il formato valuta preferito.' },
      { title: 'Avvisi di scadenza', desc: 'Attiva gli avvisi e imposta i giorni di anticipo.' },
      { title: 'Installa e aggiorna', desc: 'Installa sui dispositivi compatibili e cerca aggiornamenti.' },
    ],
  },
  de: {
    headerTitle: 'NITA-Benutzerhandbuch',
    step1Disclaimer:
      'NITA ist ein reines Organisationstool. Es verwaltet kein Geld und führt keine Finanztransaktionen für Sie aus. Sie erfassen Ihre Daten und entscheiden selbst über Ihr Geld.',
    step1DemoEditHint: 'Zum Bearbeiten auf den Betrag tippen',
    step1DemoConfirmHint: 'Mit ✓ oder Enter bestätigen',
    step1DemoAmount: '$ 1.000.000',
    step1DemoVariableAmount: '$ 550.000',
    step2DemoConcept: 'Internet / Verträge',
    step2DemoAmount: '$ 45.000',
    step2DemoDueLabel: 'Fällig am 10.',
    step2DemoToggleHint: 'Kreis zum Testen antippen',
    step2AlertRangeNote: 'Konfigurierbar von 1 bis 30 Tage vorher + am Fälligkeitstag',
    step3DemoExtraDaysCount: '3 Tage',
    step3DemoWeekDaysCount: '7 Tage',
    step3ToggleHint: 'Zusatztage verschieben testen:',
    step4ExampleText:
      'Sie haben im Supermarkt für $15.000 eingekauft. Sie tragen Betrag und passende Kategorie ein. NITA aktualisiert das Guthaben des zugehörigen Glases.',
    step4DemoMerchant: 'Supermarkt',
    step4DemoCategory: 'Lebensmittel',
    step4DemoAmount: '-$ 15.000',
    step4DemoBefore: '$ 60.000',
    step4DemoAfter: '$ 45.000',
    step4OverbudgetNote: 'Bei Überschreitung wird das Glas rot markiert, um Sie hinzuweisen.',
    step5ClosingMessage:
      'Sie kennen jetzt die wichtigsten Funktionen von NITA! Starten Sie mit der Organisation Ihrer Einnahmen, Ausgaben und Ersparnisse. NITA hilft beim Strukturieren Ihrer Daten: Alle Entscheidungen liegen bei Ihnen.',
    step5Items: [
      { title: 'Hell- und Dunkelmodus', desc: 'Design jederzeit mit einem Tipp wechseln.' },
      { title: 'Sprache und Währung', desc: 'Aus 7 Sprachen und Währungsformaten wählen.' },
      { title: 'Fälligkeitshinweise', desc: 'Erinnerungen aktivieren und Vorlaufzeit festlegen.' },
      { title: 'Installieren & Updates', desc: 'Auf kompatiblen Geräten installieren und Updates prüfen.' },
    ],
  },
};

const STEPS: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Ingreso',
    icon: Wallet,
    title: 'Empecemos organizando tus ingresos',
    description: 'Cargá tu ingreso neto mensual disponible para que NITA ordene tu presupuesto del mes.',
    highlights: [
      {
        title: '¿Qué es el ingreso neto mensual?',
        desc: 'Es el dinero total disponible con el que contás en el mes para organizar tus compromisos y gastos.',
        icon: Wallet,
      },
      {
        title: 'Dónde encontrarlo y editarlo',
        desc: 'En la tarjeta azul superior «Ingreso Neto Mensual», tocá sobre el número junto al lápiz para escribir el importe.',
        icon: Pencil,
      },
      {
        title: 'Confirmación y cálculo del mes',
        desc: 'Confirmá con ✓ o Enter. Desde ahí NITA descuenta tus gastos fijos y el ahorro opcional para mostrar tus Gastos Variables.',
        icon: Check,
      },
    ],
  },
  {
    id: 2,
    tabLabel: '2. Vencimientos',
    icon: Receipt,
    title: 'Organizá tus compromisos mensuales',
    description: 'Registrá tus gastos fijos para descontarlos de tu ingreso y controlar cada fecha de pago.',
    highlights: [
      {
        title: 'Cargar gasto fijo y vencimiento',
        desc: 'Tocá «CARGAR +» en Gastos Fijos e ingresá concepto, importe, categoría y el día de vencimiento en el calendario.',
        icon: Calendar,
      },
      {
        title: 'Impacto en tu presupuesto',
        desc: 'Cada gasto fijo se resta automáticamente de tu ingreso neto para calcular el presupuesto restante disponible.',
        icon: Receipt,
      },
      {
        title: 'Marcar como pagado y avisos',
        desc: 'Tocá el círculo para alternar entre Por Pagar y Pagado, y configurá en Ajustes con cuántos días de anticipación querés ver avisos.',
        icon: Bell,
      },
    ],
    tip: 'Si tus compromisos se repiten mes a mes, podés usar «Copiar del mes anterior» al pie de la pantalla.',
  },
  {
    id: 3,
    tabLabel: '3. Los 5 Frascos',
    icon: JarIcon,
    title: 'Conocé cómo NITA organiza tu presupuesto',
    description: 'El presupuesto disponible para gastos variables se divide en 5 frascos según el calendario real del mes.',
    highlights: [
      {
        title: 'Días Extras al inicio o al final',
        desc: 'Cubre los días excedentes a 28 (en meses de 29 a 31 días). Elegí si ubicarlos en «Primeros días» o «Últimos días».',
        icon: Calendar,
      },
      {
        title: 'Semanas 1, 2, 3 y 4',
        desc: 'Las 4 semanas completas de 7 días reciben presupuestos iguales para ordenar tus consumos cotidianos.',
        icon: JarIcon,
      },
      {
        title: 'Disponible, gastado y progreso',
        desc: 'Cada frasco muestra su Monto Asignado, lo Gastado, su barra de avance y cuánto sigue Disponible.',
        icon: CheckCircle2,
      },
      {
        title: 'Frasco en curso',
        desc: 'El período actual se resalta en celeste con la etiqueta «En Curso» para que ubiques tu saldo de hoy al instante.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 4,
    tabLabel: '4. Gastos Diarios',
    icon: ShoppingBag,
    title: 'Registrá tus consumos cotidianos',
    description: 'Anotá tus compras diarias para descontarlas del frasco de su semana y seguir tu saldo.',
    highlights: [
      {
        title: 'Agregar fecha, importe y categoría',
        desc: 'Tocá «CARGAR +» en Consumos Diarios, completá descripción, monto, categoría y elegí la fecha en el calendario del mes.',
        icon: ShoppingBag,
      },
      {
        title: 'Consultar movimientos y descuento',
        desc: 'Buscá o filtrá tus gastos del mes en la lista. Cada consumo se descuenta del frasco que corresponde a su fecha.',
        icon: Check,
      },
      {
        title: 'Alertas visuales si te excedés',
        desc: 'Si un frasco supera su presupuesto asignado, NITA lo resalta en rojo y te permite redistribuir la diferencia si lo elegís.',
        icon: AlertTriangle,
      },
    ],
    tip: 'Podés cargar consumos de días anteriores eligiendo su fecha exacta para mantener tus frascos al día.',
  },
  {
    id: 5,
    tabLabel: '5. Ajustes y App',
    icon: Settings,
    title: 'Personalizá NITA a tu manera',
    description: 'Desde la rueda de configuraciones (⚙️) adaptás la apariencia, alertas y preferencias de la aplicación.',
    highlights: [
      {
        title: 'Tema, idioma y moneda',
        desc: 'Alterná entre Modo Blanco y Modo Oscuro, elegí entre los 7 idiomas disponibles y seleccioná tu formato de moneda.',
        icon: Globe,
      },
      {
        title: 'Avisos, instalación y actualizaciones',
        desc: 'Configurá tus avisos de vencimiento, instalá NITA en dispositivos compatibles y buscá o aplicá actualizaciones cuando estén disponibles.',
        icon: Smartphone,
      },
    ],
  },
];

const STEPS_EN: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Income',
    icon: Wallet,
    title: 'Let’s start organizing your income',
    description: 'Enter your available net monthly income so NITA can structure your monthly budget.',
    highlights: [
      {
        title: 'What is net monthly income?',
        desc: 'It is the total real money you have available for the month to organize commitments and spending.',
        icon: Wallet,
      },
      {
        title: 'Where to find and edit it',
        desc: 'In the blue top card “Net Monthly Income”, tap the figure next to the pencil icon to enter your amount.',
        icon: Pencil,
      },
      {
        title: 'Confirmation and monthly layout',
        desc: 'Confirm with ✓ or Enter. NITA subtracts fixed expenses and optional savings to calculate your Variable Expenses.',
        icon: Check,
      },
    ],
  },
  {
    id: 2,
    tabLabel: '2. Due Dates',
    icon: Receipt,
    title: 'Organize your monthly commitments',
    description: 'Record recurring bills so they are deducted from your income and tracked by due date.',
    highlights: [
      {
        title: 'Add fixed expense and due date',
        desc: 'Tap “CARGAR +” in Fixed Expenses and enter concept, amount, category, and due date in the monthly calendar.',
        icon: Calendar,
      },
      {
        title: 'Budget impact',
        desc: 'Fixed expenses are subtracted from your net income to calculate the remaining budget available.',
        icon: Receipt,
      },
      {
        title: 'Mark as paid and alerts',
        desc: 'Tap the circle to switch between Pending and Paid, and configure in Settings how many days ahead to show alerts.',
        icon: Bell,
      },
    ],
    tip: 'If your commitments repeat each month, use “Copy from previous month” at the bottom to preload them quickly.',
  },
  {
    id: 3,
    tabLabel: '3. The 5 Jars',
    icon: JarIcon,
    title: 'See how NITA organizes your budget',
    description: 'Your remaining variable budget is divided into 5 jars tailored to the real calendar of the month.',
    highlights: [
      {
        title: 'Extra Days at start or end',
        desc: 'Covers days beyond 28 (in 29–31 day months). Place them under “First days” or “Last days”.',
        icon: Calendar,
      },
      {
        title: 'Weeks 1, 2, 3 and 4',
        desc: 'The 4 full 7-day weeks each receive an equal budget for your everyday spending.',
        icon: JarIcon,
      },
      {
        title: 'Available, spent, and progress',
        desc: 'Each jar displays its Assigned Amount, Spent total, progress bar, and remaining Available balance.',
        icon: CheckCircle2,
      },
      {
        title: 'Active period jar',
        desc: 'The current period highlights in sky blue with the “In Progress” label so you see today’s balance at a glance.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 4,
    tabLabel: '4. Daily Expenses',
    icon: ShoppingBag,
    title: 'Record your everyday purchases',
    description: 'Log daily spending so it deducts from the matching weekly jar and keeps your balance current.',
    highlights: [
      {
        title: 'Add date, amount, and category',
        desc: 'Tap “CARGAR +” in Daily Expenses, enter description, amount, category, and pick the date in the current month calendar.',
        icon: ShoppingBag,
      },
      {
        title: 'Review entries and deductions',
        desc: 'Search or filter entries in the monthly list. Each expense deducts from the jar covering that date.',
        icon: Check,
      },
      {
        title: 'Visual alerts when exceeded',
        desc: 'If a jar goes over budget, NITA highlights it in red and lets you redistribute the excess across upcoming jars if desired.',
        icon: AlertTriangle,
      },
    ],
    tip: 'You can log purchases from earlier days by picking their exact date so every jar stays accurate.',
  },
  {
    id: 5,
    tabLabel: '5. Settings & App',
    icon: Settings,
    title: 'Customize NITA your way',
    description: 'From the settings wheel (⚙️), tailor appearance, alerts, language, and app preferences.',
    highlights: [
      {
        title: 'Theme, language, and currency',
        desc: 'Switch between Light Mode and Dark Mode, choose from 7 languages, and pick your currency format.',
        icon: Globe,
      },
      {
        title: 'Alerts, install, and updates',
        desc: 'Configure due date alerts, install NITA on supported devices, and check or apply updates when available.',
        icon: Smartphone,
      },
    ],
  },
];

const STEPS_CA: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Ingrés',
    icon: Wallet,
    title: 'Comencem organitzant els teus ingressos',
    description: 'Carrega el teu ingrés net mensual disponible perquè NITA ordeni el teu pressupost del mes.',
    highlights: [
      {
        title: 'Què és l’ingrés net mensual?',
        desc: 'És el diner total disponible amb què comptes durant el mes per organitzar compromisos i despeses.',
        icon: Wallet,
      },
      {
        title: 'On trobar-lo i editar-lo',
        desc: 'A la targeta blava superior «Ingrés Net Mensual», toca el número al costat del llapis per escriure l’import.',
        icon: Pencil,
      },
      {
        title: 'Confirmació i càlcul del mes',
        desc: 'Confirma amb ✓ o Enter. NITA resta despeses fixes i estalvi opcional per calcular les teves Despeses Variables.',
        icon: Check,
      },
    ],
  },
  {
    id: 2,
    tabLabel: '2. Venciments',
    icon: Receipt,
    title: 'Organitza els teus compromisos mensuals',
    description: 'Registra els teus pagaments recurrents per descomptar-los de l’ingrés i controlar cada venciment.',
    highlights: [
      {
        title: 'Afegir despesa fixa i venciment',
        desc: 'Toca «CARGAR +» a Despeses Fixes i introdueix concepte, import, categoria i data al calendari del mes.',
        icon: Calendar,
      },
      {
        title: 'Impacte al pressupost',
        desc: 'Cada despesa fixa es resta automàticament del teu ingrés net per mostrar el pressupost restant disponible.',
        icon: Receipt,
      },
      {
        title: 'Marcar com a pagat i avisos',
        desc: 'Toca el cercle per alternar entre Per Pagar i Pagat, i configura a Ajustos quants dies abans vols rebre avisos.',
        icon: Bell,
      },
    ],
    tip: 'Si els compromisos es repeteixen cada mes, pots usar «Copiar del mes anterior» al peu de la pantalla.',
  },
  {
    id: 3,
    tabLabel: '3. Els 5 Pots',
    icon: JarIcon,
    title: 'Coneix com NITA organitza el teu pressupost',
    description: 'El pressupost disponible per a despeses variables es divideix en 5 pots segons el calendari real del mes.',
    highlights: [
      {
        title: 'Dies Extres a l’inici o al final',
        desc: 'Cobreix els dies excedents de 28 (en mesos de 29 a 31 dies). Tria ubicar-los a «Primers dies» o «Últims dies».',
        icon: Calendar,
      },
      {
        title: 'Setmanes 1, 2, 3 i 4',
        desc: 'Les 4 setmanes completes de 7 dies reben pressupostos iguals per ordenar els consums quotidians.',
        icon: JarIcon,
      },
      {
        title: 'Disponible, gastat i progrés',
        desc: 'Cada pot mostra el seu Import Assignat, el Gastat, la barra d’avenç i quant segueix Disponible.',
        icon: CheckCircle2,
      },
      {
        title: 'Pot en curs',
        desc: 'El període actual es ressalta en blau cel amb l’etiqueta «En Curs» per identificar el teu saldo d’avui.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 4,
    tabLabel: '4. Despeses Diàries',
    icon: ShoppingBag,
    title: 'Registra els teus consums quotidians',
    description: 'Apunta les teves compres diàries per descomptar-les del pot de la seva setmana i seguir el saldo.',
    highlights: [
      {
        title: 'Afegir data, import i categoria',
        desc: 'Toca «CARGAR +» a Consums Diaris, completa descripció, import, categoria i tria la data al calendari del mes.',
        icon: ShoppingBag,
      },
      {
        title: 'Consultar moviments i descompte',
        desc: 'Cerca o filtra les despeses del mes al llistat. Cada consum es descompta del pot corresponent a la seva data.',
        icon: Check,
      },
      {
        title: 'Alertes visuals si t’excedeixes',
        desc: 'Si un pot supera el pressupost, NITA el marca en vermell i et permet redistribuir la diferència si ho decideixes.',
        icon: AlertTriangle,
      },
    ],
    tip: 'Pots registrar compres de dies anteriors triant la data exacta per mantenir els pots al dia.',
  },
  {
    id: 5,
    tabLabel: '5. Ajustos i App',
    icon: Settings,
    title: 'Personalitza NITA a la teva manera',
    description: 'Des de la roda de configuracions (⚙️) adaptes l’aparença, alertes i preferències de l’aplicació.',
    highlights: [
      {
        title: 'Tema, idioma i moneda',
        desc: 'Alterna entre Mode Blanc i Mode Fosc, tria entre els 7 idiomes disponibles i selecciona el format de moneda.',
        icon: Globe,
      },
      {
        title: 'Avisos, instal·lació i actualitzacions',
        desc: 'Configura els avisos de venciment, instal·la NITA en dispositius compatibles i cerca o aplica actualitzacions disponibles.',
        icon: Smartphone,
      },
    ],
  },
];

const STEPS_PT: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Renda',
    icon: Wallet,
    title: 'Vamos começar organizando sua renda',
    description: 'Informe sua renda líquida mensal disponível para que o NITA organize seu orçamento do mês.',
    highlights: [
      {
        title: 'O que é a renda líquida mensal?',
        desc: 'É o valor total real disponível no mês para organizar seus compromissos e gastos.',
        icon: Wallet,
      },
      {
        title: 'Onde encontrar e editar',
        desc: 'No cartão azul superior «Renda Líquida Mensal», toque no número ao lado do lápis para digitar o valor.',
        icon: Pencil,
      },
      {
        title: 'Confirmação e cálculo do mês',
        desc: 'Confirme com ✓ ou Enter. O NITA desconta gastos fixos e poupança opcional para calcular seus Gastos Variáveis.',
        icon: Check,
      },
    ],
  },
  {
    id: 2,
    tabLabel: '2. Vencimentos',
    icon: Receipt,
    title: 'Organize seus compromissos mensais',
    description: 'Registre seus gastos fixos para descontá-los da renda e acompanhar cada data de vencimento.',
    highlights: [
      {
        title: 'Adicionar gasto fixo e vencimento',
        desc: 'Toque em «CARGAR +» em Gastos Fixos e informe descrição, valor, categoria e data no calendário do mês.',
        icon: Calendar,
      },
      {
        title: 'Impacto no orçamento',
        desc: 'Cada gasto fixo é subtraído automaticamente da sua renda líquida para calcular o saldo restante.',
        icon: Receipt,
      },
      {
        title: 'Marcar como pago e alertas',
        desc: 'Toque no círculo para alternar entre A Pagar e Pago, e defina em Configurações quantos dias antes deseja receber avisos.',
        icon: Bell,
      },
    ],
    tip: 'Se os compromissos se repetem todo mês, use «Copiar do mês anterior» no rodapé da tela.',
  },
  {
    id: 3,
    tabLabel: '3. Os 5 Potes',
    icon: JarIcon,
    title: 'Conheça como o NITA organiza seu orçamento',
    description: 'O orçamento disponível para gastos variáveis é dividido em 5 potes conforme o calendário real do mês.',
    highlights: [
      {
        title: 'Dias Extras no início ou no fim',
        desc: 'Cobre os dias excedentes a 28 (em meses de 29 a 31 dias). Escolha posicioná-los em «Primeiros dias» ou «Últimos dias».',
        icon: Calendar,
      },
      {
        title: 'Semanas 1, 2, 3 e 4',
        desc: 'As 4 semanas completas de 7 dias recebem orçamentos iguais para organizar seus consumos diários.',
        icon: JarIcon,
      },
      {
        title: 'Disponível, gasto e progresso',
        desc: 'Cada pote exibe seu Valor Atribuído, o Gasto acumulado, a barra de progresso e o saldo Disponível.',
        icon: CheckCircle2,
      },
      {
        title: 'Pote em andamento',
        desc: 'O período atual aparece destacado em azul-celeste com a etiqueta «Em Curso» para identificar seu saldo de hoje.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 4,
    tabLabel: '4. Gastos Diários',
    icon: ShoppingBag,
    title: 'Registre seus consumos do dia a dia',
    description: 'Anote suas compras diárias para descontar do pote da semana correspondente e acompanhar seu saldo.',
    highlights: [
      {
        title: 'Informar data, valor e categoria',
        desc: 'Toque em «CARGAR +» em Gastos Diários, preencha descrição, valor, categoria e escolha a data no calendário.',
        icon: ShoppingBag,
      },
      {
        title: 'Consultar movimentos e desconto',
        desc: 'Pesquise ou filtre seus gastos do mês na lista. Cada lançamento é descontado do pote da data escolhida.',
        icon: Check,
      },
      {
        title: 'Alertas visuais ao ultrapassar',
        desc: 'Se um pote exceder o orçamento, o NITA destaca em vermelho e permite redistribuir a diferença se você desejar.',
        icon: AlertTriangle,
      },
    ],
    tip: 'Você pode registrar compras de dias anteriores escolhendo a data exata para manter seus potes atualizados.',
  },
  {
    id: 5,
    tabLabel: '5. Ajustes e App',
    icon: Settings,
    title: 'Personalize o NITA do seu jeito',
    description: 'Pela roda de configurações (⚙️) você ajusta visual, idioma, moeda, alertas e opções do aplicativo.',
    highlights: [
      {
        title: 'Tema, idioma e moeda',
        desc: 'Alterne entre Modo Claro e Modo Escuro, escolha entre 7 idiomas e selecione seu formato de moeda.',
        icon: Globe,
      },
      {
        title: 'Alertas, instalação e atualizações',
        desc: 'Configure avisos de vencimento, instale o NITA em dispositivos compatíveis e busque ou aplique atualizações disponíveis.',
        icon: Smartphone,
      },
    ],
  },
];

const STEPS_FR: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Revenu',
    icon: Wallet,
    title: 'Commençons par organiser vos revenus',
    description: 'Saisissez votre revenu net mensuel disponible pour que NITA structure votre budget du mois.',
    highlights: [
      {
        title: 'Qu’est-ce que le revenu net mensuel ?',
        desc: 'C’est le montant total disponible ce mois-ci pour organiser vos charges et vos dépenses.',
        icon: Wallet,
      },
      {
        title: 'Où le trouver et le modifier',
        desc: 'Sur la carte bleue supérieure « Revenu Net Mensuel », touchez le montant à côté du crayon pour le saisir.',
        icon: Pencil,
      },
      {
        title: 'Validation et calcul du mois',
        desc: 'Validez avec ✓ ou Entrée. NITA déduit vos dépenses fixes et votre épargne optionnelle pour calculer vos Dépenses Variables.',
        icon: Check,
      },
    ],
  },
  {
    id: 2,
    tabLabel: '2. Échéances',
    icon: Receipt,
    title: 'Organisez vos engagements mensuels',
    description: 'Enregistrez vos paiements récurrents pour les déduire du revenu et suivre chaque échéance.',
    highlights: [
      {
        title: 'Ajouter dépense fixe et échéance',
        desc: 'Touchez « CARGAR + » dans Dépenses Fixes et saisissez libellé, montant, catégorie et date dans le calendrier.',
        icon: Calendar,
      },
      {
        title: 'Impact sur le budget',
        desc: 'Chaque dépense fixe est déduite automatiquement de votre revenu net pour calculer le budget restant.',
        icon: Receipt,
      },
      {
        title: 'Marquer comme payée et alertes',
        desc: 'Touchez le cercle pour passer d’À Payer à Payée, et réglez dans Paramètres le délai des alertes avant échéance.',
        icon: Bell,
      },
    ],
    tip: 'Si vos charges se répètent chaque mois, utilisez « Copier du mois précédent » en bas de l’écran.',
  },
  {
    id: 3,
    tabLabel: '3. Les 5 Bocaux',
    icon: JarIcon,
    title: 'Découvrez comment NITA organise votre budget',
    description: 'Votre budget disponible pour les dépenses variables est réparti en 5 bocaux selon le calendrier réel du mois.',
    highlights: [
      {
        title: 'Jours Supplémentaires au début ou à la fin',
        desc: 'Couvre les jours au-delà de 28 (mois de 29 à 31 jours). Placez-les sur « Premiers jours » ou « Derniers jours ».',
        icon: Calendar,
      },
      {
        title: 'Semaines 1, 2, 3 et 4',
        desc: 'Les 4 semaines complètes de 7 jours reçoivent un budget égal pour vos dépenses quotidiennes.',
        icon: JarIcon,
      },
      {
        title: 'Disponible, dépensé et progression',
        desc: 'Chaque bocal affiche son Montant Alloué, ce qui est Dépensé, la barre de progression et le solde Disponible.',
        icon: CheckCircle2,
      },
      {
        title: 'Bocal en cours',
        desc: 'La période active est mise en avant en bleu ciel avec le libellé « En Cours » pour repérer votre solde du jour.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 4,
    tabLabel: '4. Dépenses Quotidiennes',
    icon: ShoppingBag,
    title: 'Enregistrez vos achats quotidiens',
    description: 'Notez vos dépenses de tous les jours pour les déduire du bocal de la semaine correspondante.',
    highlights: [
      {
        title: 'Saisir date, montant et catégorie',
        desc: 'Touchez « CARGAR + » dans Dépenses Quotidiennes, saisissez libellé, montant, catégorie et la date dans le calendrier.',
        icon: ShoppingBag,
      },
      {
        title: 'Consulter et filtrer les opérations',
        desc: 'Recherchez ou filtrez vos achats du mois dans la liste. Chaque dépense est imputée au bocal de sa date.',
        icon: Check,
      },
      {
        title: 'Alertes visuelles en cas de dépassement',
        desc: 'Si un bocal dépasse son budget, NITA le signale en rouge et vous permet de rééquilibrer les bocaux suivants si vous le souhaitez.',
        icon: AlertTriangle,
      },
    ],
    tip: 'Vous pouvez saisir un achat passé en choisissant sa date exacte afin de garder vos bocaux à jour.',
  },
  {
    id: 5,
    tabLabel: '5. Paramètres & App',
    icon: Settings,
    title: 'Personnalisez NITA à votre façon',
    description: 'Depuis la roue des paramètres (⚙️), adaptez l’apparence, les alertes, la langue et l’application.',
    highlights: [
      {
        title: 'Thème, langue et devise',
        desc: 'Passez du Mode Clair au Mode Sombre, choisissez parmi 7 langues et sélectionnez votre format de devise.',
        icon: Globe,
      },
      {
        title: 'Alertes, installation et mises à jour',
        desc: 'Réglez vos alertes d’échéance, installez NITA sur appareil compatible et vérifiez ou appliquez les mises à jour disponibles.',
        icon: Smartphone,
      },
    ],
  },
];

const STEPS_IT: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Entrate',
    icon: Wallet,
    title: 'Iniziamo organizzando le tue entrate',
    description: 'Inserisci il tuo reddito netto mensile disponibile affinché NITA organizzi il budget del mese.',
    highlights: [
      {
        title: 'Cos’è il reddito netto mensile?',
        desc: 'È il denaro reale totale disponibile nel mese per organizzare impegni e spese.',
        icon: Wallet,
      },
      {
        title: 'Dove trovarlo e modificarlo',
        desc: 'Nella scheda blu in alto «Reddito Netto Mensile», tocca l’importo accanto alla matita per scrivere il valore.',
        icon: Pencil,
      },
      {
        title: 'Conferma e calcolo del mese',
        desc: 'Conferma con ✓ o Invio. NITA sottrae le spese fisse e il risparmio opzionale per calcolare le Spese Variabili.',
        icon: Check,
      },
    ],
  },
  {
    id: 2,
    tabLabel: '2. Scadenze',
    icon: Receipt,
    title: 'Organizza i tuoi impegni mensili',
    description: 'Registra le spese fisse per detrarle dal reddito e tenere sotto controllo ogni scadenza.',
    highlights: [
      {
        title: 'Aggiungi spesa fissa e scadenza',
        desc: 'Tocca «CARGAR +» in Spese Fisse e inserisci descrizione, importo, categoria e data nel calendario del mese.',
        icon: Calendar,
      },
      {
        title: 'Impatto sul budget',
        desc: 'Ogni spesa fissa viene sottratta automaticamente dal reddito netto per mostrare il budget residuo.',
        icon: Receipt,
      },
      {
        title: 'Segna come pagata e avvisi',
        desc: 'Tocca il cerchio per passare da Da Pagare a Pagata e scegli nelle Impostazioni quanti giorni prima ricevere avvisi.',
        icon: Bell,
      },
    ],
    tip: 'Se gli impegni si ripetono ogni mese, usa «Copia dal mese precedente» in fondo alla pagina.',
  },
  {
    id: 3,
    tabLabel: '3. I 5 Barattoli',
    icon: JarIcon,
    title: 'Scopri come NITA organizza il tuo budget',
    description: 'Il budget disponibile per le spese variabili viene suddiviso in 5 barattoli secondo il calendario reale del mese.',
    highlights: [
      {
        title: 'Giorni Extra all’inizio o alla fine',
        desc: 'Copre i giorni oltre i 28 (nei mesi di 29–31 giorni). Scegli se posizionarli in «Primi giorni» o «Ultimi giorni».',
        icon: Calendar,
      },
      {
        title: 'Settimane 1, 2, 3 e 4',
        desc: 'Le 4 settimane complete di 7 giorni ricevono un budget uguale per organizzare i consumi quotidiani.',
        icon: JarIcon,
      },
      {
        title: 'Disponibile, speso e progresso',
        desc: 'Ogni barattolo mostra Importo Assegnato, totale Speso, barra di avanzamento e saldo Disponibile.',
        icon: CheckCircle2,
      },
      {
        title: 'Barattolo in corso',
        desc: 'Il periodo attuale è evidenziato in azzurro con l’etichetta «In Corso» per individuare subito il saldo di oggi.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 4,
    tabLabel: '4. Spese Giornaliere',
    icon: ShoppingBag,
    title: 'Registra i tuoi consumi quotidiani',
    description: 'Annota gli acquisti di ogni giorno per scalarli dal barattolo della rispettiva settimana.',
    highlights: [
      {
        title: 'Inserisci data, importo e categoria',
        desc: 'Tocca «CARGAR +» in Spese Giornaliere, inserisci descrizione, importo, categoria e scegli la data nel calendario.',
        icon: ShoppingBag,
      },
      {
        title: 'Consulta movimenti e detrazioni',
        desc: 'Cerca o filtra i movimenti del mese nell’elenco. Ogni spesa viene scalata dal barattolo di quella data.',
        icon: Check,
      },
      {
        title: 'Avvisi visivi in caso di eccesso',
        desc: 'Se un barattolo supera il budget, NITA lo evidenzia in rosso e consente di ridistribuire la differenza se lo desideri.',
        icon: AlertTriangle,
      },
    ],
    tip: 'Puoi registrare acquisti di giorni precedenti selezionando la data esatta per mantenere i barattoli aggiornati.',
  },
  {
    id: 5,
    tabLabel: '5. Impostazioni & App',
    icon: Settings,
    title: 'Personalizza NITA a modo tuo',
    description: 'Dalla rotella delle impostazioni (⚙️) adatti aspetto, lingua, avvisi e opzioni dell’app.',
    highlights: [
      {
        title: 'Tema, lingua e valuta',
        desc: 'Passa da Tema Chiaro a Tema Scuro, scegli tra 7 lingue disponibili e seleziona il formato della valuta.',
        icon: Globe,
      },
      {
        title: 'Avvisi, installazione e aggiornamenti',
        desc: 'Configura gli avvisi di scadenza, installa NITA sui dispositivi compatibili e cerca o applica aggiornamenti disponibili.',
        icon: Smartphone,
      },
    ],
  },
];

const STEPS_DE: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Einkommen',
    icon: Wallet,
    title: 'Starten wir mit Ihren Einnahmen',
    description: 'Tragen Sie Ihr monatliches Nettoeinkommen ein, damit NITA Ihr Monatsbudget strukturiert.',
    highlights: [
      {
        title: 'Was ist das Nettoeinkommen?',
        desc: 'Es ist der gesamte im Monat verfügbare Betrag, mit dem Sie Verpflichtungen und Ausgaben planen.',
        icon: Wallet,
      },
      {
        title: 'Wo Sie es finden und ändern',
        desc: 'Tippen Sie in der blauen Karte „Monatliches Nettoeinkommen“ auf den Betrag neben dem Stift-Symbol.',
        icon: Pencil,
      },
      {
        title: 'Bestätigen und Monatsaufteilung',
        desc: 'Bestätigen Sie mit ✓ oder Enter. NITA zieht Fixkosten und optionales Sparen ab und zeigt Ihre variablen Ausgaben.',
        icon: Check,
      },
    ],
  },
  {
    id: 2,
    tabLabel: '2. Fälligkeiten',
    icon: Receipt,
    title: 'Organisieren Sie Ihre monatlichen Fixkosten',
    description: 'Erfassen Sie wiederkehrende Zahlungen, um sie direkt abzuziehen und Termine im Blick zu behalten.',
    highlights: [
      {
        title: 'Fixkosten und Fälligkeit erfassen',
        desc: 'Tippen Sie auf „CARGAR +“ bei Fixkosten und geben Sie Zweck, Betrag, Kategorie und Datum im Kalender ein.',
        icon: Calendar,
      },
      {
        title: 'Auswirkung auf das Budget',
        desc: 'Fixkosten werden automatisch vom Nettoeinkommen abgezogen, um das verbleibende Budget zu berechnen.',
        icon: Receipt,
      },
      {
        title: 'Als bezahlt markieren & Hinweise',
        desc: 'Tippen Sie auf den Kreis zum Umschalten auf Bezahlt und legen Sie in den Einstellungen die Vorlaufzeit für Hinweise fest.',
        icon: Bell,
      },
    ],
    tip: 'Wiederkehrende Ausgaben lassen sich unten auf der Seite mit „Vom Vormonat kopieren“ schnell übernehmen.',
  },
  {
    id: 3,
    tabLabel: '3. Die 5 Gläser',
    icon: JarIcon,
    title: 'So strukturiert NITA Ihr Budget',
    description: 'Das Budget für variable Ausgaben wird anhand des echten Monatskalenders auf 5 Gläser verteilt.',
    highlights: [
      {
        title: 'Zusatztage am Anfang oder Ende',
        desc: 'Deckt Tage über 28 hinaus ab (in Monaten mit 29–31 Tagen). Platzierbar unter „Erste Tage“ oder „Letzte Tage“.',
        icon: Calendar,
      },
      {
        title: 'Woche 1, 2, 3 und 4',
        desc: 'Die 4 vollen 7-Tage-Wochen erhalten jeweils ein gleiches Budget für Ihre täglichen Ausgaben.',
        icon: JarIcon,
      },
      {
        title: 'Verfügbar, Ausgaben und Fortschritt',
        desc: 'Jedes Glas zeigt den zugewiesenen Betrag, bisherige Ausgaben, den Fortschrittsbalken und das verfügbare Guthaben.',
        icon: CheckCircle2,
      },
      {
        title: 'Aktuelles Zeitfenster',
        desc: 'Das Glas des laufenden Zeitraums wird hellblau mit „Laufend“ hervorgehoben, damit Sie sofort Ihren aktuellen Stand sehen.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 4,
    tabLabel: '4. Tägliche Ausgaben',
    icon: ShoppingBag,
    title: 'Erfassen Sie Ihre täglichen Ausgaben',
    description: 'Notieren Sie alltägliche Einkäufe, damit sie automatisch vom passenden Wochenglas abgezogen werden.',
    highlights: [
      {
        title: 'Datum, Betrag und Kategorie wählen',
        desc: 'Tippen Sie bei Täglichen Ausgaben auf „CARGAR +“, füllen Sie Beschreibung, Betrag, Kategorie und Kalenderdatum aus.',
        icon: ShoppingBag,
      },
      {
        title: 'Einträge prüfen und filtern',
        desc: 'Durchsuchen oder filtern Sie Ihre Monatsliste. Jede Ausgabe wird vom Glas des gewählten Datums abgezogen.',
        icon: Check,
      },
      {
        title: 'Warnhinweise bei Überschreitung',
        desc: 'Übersteigt eine Ausgabe das Glasbudget, markiert NITA es rot und ermöglicht auf Wunsch eine Anpassung der Folgegläser.',
        icon: AlertTriangle,
      },
    ],
    tip: 'Auch frühere Einkäufe lassen sich mit ihrem genauen Datum erfassen, damit jedes Glas aktuell bleibt.',
  },
  {
    id: 5,
    tabLabel: '5. Einstellungen & App',
    icon: Settings,
    title: 'Passen Sie NITA nach Ihren Wünschen an',
    description: 'Über das Einstellungsrad (⚙️) passen Sie Darstellung, Sprache, Hinweise und App-Funktionen an.',
    highlights: [
      {
        title: 'Design, Sprache und Währung',
        desc: 'Wechseln Sie zwischen Hell- und Dunkelmodus, wählen Sie aus 7 Sprachen und stellen Sie Ihr Währungsformat ein.',
        icon: Globe,
      },
      {
        title: 'Hinweise, Installation & Updates',
        desc: 'Legen Sie Fälligkeitserinnerungen fest, installieren Sie NITA auf unterstützten Geräten und prüfen Sie verfügbare Updates.',
        icon: Smartphone,
      },
    ],
  },
];

const STEPS_MAP: Record<string, StepInfo[]> = {
  es: STEPS,
  en: STEPS_EN,
  ca: STEPS_CA,
  pt: STEPS_PT,
  fr: STEPS_FR,
  it: STEPS_IT,
  de: STEPS_DE,
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  language = 'es',
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // Interactive micro-preview states local to the guide (never touch real user data)
  const [demoIncomeEditing, setDemoIncomeEditing] = useState(false);
  const [demoIncomeValue, setDemoIncomeValue] = useState<string | null>(null);
  const [demoExpensePaid, setDemoExpensePaid] = useState(false);
  const [demoExtraPos, setDemoExtraPos] = useState<'start' | 'end'>('start');

  // Transición suave compatible con Tailwind estándar al cambiar de paso
  const prevStepRef = useRef(0);
  const [isStepEntering, setIsStepEntering] = useState(false);

  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  // Cada vez que se vuelve a abrir la guía, inicia en el paso 1 (índice 0)
  useEffect(() => {
    if (isOpen) {
      prevStepRef.current = 0;
      setIsStepEntering(false);
      setActiveStepIndex(0);
      setDemoIncomeEditing(false);
      setDemoIncomeValue(null);
      setDemoExpensePaid(false);
      setDemoExtraPos('start');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      prevStepRef.current = 0;
      setIsStepEntering(false);
      return;
    }
    if (prevStepRef.current !== activeStepIndex) {
      prevStepRef.current = activeStepIndex;
      setIsStepEntering(true);
      const raf = requestAnimationFrame(() => {
        setIsStepEntering(false);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen, activeStepIndex]);

  // Mantener visible en móvil la pestaña activa y ubicar siempre el contenido al inicio al cambiar de paso
  useEffect(() => {
    if (!isOpen) return;
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    const activeTabEl = tabButtonRefs.current[activeStepIndex];
    if (activeTabEl && typeof activeTabEl.scrollIntoView === 'function') {
      activeTabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [isOpen, activeStepIndex]);

  const t = getTranslations(language);
  const steps = STEPS_MAP[language] || STEPS;
  const uiCopy = GUIDE_UI_MAP[language] || GUIDE_UI_MAP.es;

  const isFirst = activeStepIndex === 0;
  const isLast = activeStepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      setActiveStepIndex(0);
      onClose();
    } else {
      setActiveStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setActiveStepIndex((prev) => prev - 1);
    }
  };

  const handleClose = () => {
    setActiveStepIndex(0);
    onClose();
  };

  // Touch gesture support: deslizar horizontalmente en celulares
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - touchStartRef.current.x;
    const deltaY = touchEnd.clientY - touchStartRef.current.y;
    const elapsedTime = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    const minSwipeDistance = 40;
    if (
      elapsedTime < 800 &&
      Math.abs(deltaX) >= minSwipeDistance &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.2
    ) {
      if (deltaX < 0) {
        if (activeStepIndex < steps.length - 1) {
          setActiveStepIndex((prev) => prev + 1);
        }
      } else {
        if (activeStepIndex > 0) {
          setActiveStepIndex((prev) => prev - 1);
        }
      }
    }
  };

  // Atajos con flechas del teclado y cierre con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      const isEditingInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA';

      if (e.key === 'ArrowRight' && !isEditingInput) {
        if (activeStepIndex < steps.length - 1) {
          setActiveStepIndex((prev) => prev + 1);
        }
      } else if (e.key === 'ArrowLeft' && !isEditingInput) {
        if (activeStepIndex > 0) {
          setActiveStepIndex((prev) => prev - 1);
        }
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeStepIndex, steps.length]);

  if (!isOpen) return null;

  const currentStep = steps[activeStepIndex] || steps[0];
  const StepHeroIcon = currentStep.icon;

  // Formato coherente con la moneda de demostración según idioma (solo ilustrativo)
  const formatDemoMoney = (amount: number): string => {
    const sep = language === 'en' ? ',' : language === 'fr' ? ' ' : '.';
    const formatted = Math.round(amount)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return `$ ${formatted}`;
  };

  // Representación visual interactiva de los 5 Frascos (Paso 3)
  // Suma total asignada: $70.000 + $120.000 + $120.000 + $120.000 + $120.000 = $550.000 (coincide con Paso 1)
  const demoWeeklyJars = [
    {
      id: 1,
      title: `${t.jarWeekPrefix} 1`,
      assigned: formatDemoMoney(120000),
      spent: formatDemoMoney(120000),
      available: formatDemoMoney(0),
      pct: 100,
      isCurrent: false,
    },
    {
      id: 2,
      title: `${t.jarWeekPrefix} 2`,
      assigned: formatDemoMoney(120000),
      spent: formatDemoMoney(75000),
      available: formatDemoMoney(45000),
      pct: 62,
      isCurrent: true,
    },
    {
      id: 3,
      title: `${t.jarWeekPrefix} 3`,
      assigned: formatDemoMoney(120000),
      spent: formatDemoMoney(0),
      available: formatDemoMoney(120000),
      pct: 0,
      isCurrent: false,
    },
    {
      id: 4,
      title: `${t.jarWeekPrefix} 4`,
      assigned: formatDemoMoney(120000),
      spent: formatDemoMoney(0),
      available: formatDemoMoney(120000),
      pct: 0,
      isCurrent: false,
    },
  ];
  const demoExtraJar = {
    id: 0,
    title: t.jarExtraDaysTitle,
    assigned: formatDemoMoney(70000),
    spent: formatDemoMoney(0),
    available: formatDemoMoney(70000),
    pct: 0,
    isExtra: true,
  };
  const orderedDemoJars =
    demoExtraPos === 'start' ? [demoExtraJar, ...demoWeeklyJars] : [...demoWeeklyJars, demoExtraJar];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-xs transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nita-guide-modal-title"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-[#020617] rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0 shadow-xs flex items-center justify-center p-0.5">
              <img
                src="/nita-logo.jpg"
                alt="NITA"
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <div className="min-w-0">
              <h3
                id="nita-guide-modal-title"
                className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate"
              >
                {uiCopy.headerTitle}
              </h3>
              <p className="text-[11px] sm:text-xs font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                {t.stepOf
                  .replace('{current}', String(activeStepIndex + 1))
                  .replace('{total}', String(steps.length))}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={t.closeModal}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegación por 5 pestañas */}
        <div
          ref={tabsContainerRef}
          role="tablist"
          aria-label={uiCopy.headerTitle}
          className="px-3 py-2 sm:px-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
        >
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStepIndex;
            return (
              <button
                key={step.id}
                ref={(el) => {
                  tabButtonRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveStepIndex(idx)}
                className={`min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs font-extrabold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-sky-200' : 'text-sky-600 dark:text-sky-400'
                  }`}
                />
                <span>{step.tabLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Contenido principal con barra de scroll oculta y deslizamiento táctil */}
        <div
          ref={contentScrollRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="p-4 sm:p-6 overflow-y-auto no-scrollbar space-y-4 sm:space-y-5 flex-1 touch-pan-y bg-white dark:bg-[#020617]"
        >
          <div
            className={`space-y-4 sm:space-y-5 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
              isStepEntering ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
            }`}
          >
            {/* Cabecera del paso */}
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5">
                <StepHeroIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-snug text-balance">
                  {currentStep.title}
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {currentStep.description}
                </p>
              </div>
            </div>

            {/* Ilustración / Vista previa interactiva acorde al código real de cada paso */}
            {currentStep.id === 1 && (
              <div className="rounded-2xl bg-linear-to-br from-blue-700 via-blue-600 to-indigo-800 text-white p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-100 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-sky-200" />
                    <span>{t.netIncome}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-sky-100">
                    {demoIncomeEditing ? uiCopy.step1DemoConfirmHint : uiCopy.step1DemoEditHint}
                  </span>
                </div>

                {demoIncomeEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!demoIncomeValue || !demoIncomeValue.trim()) {
                        setDemoIncomeValue(uiCopy.step1DemoAmount);
                      }
                      setDemoIncomeEditing(false);
                    }}
                    className="flex items-center gap-2 max-w-xs"
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      value={demoIncomeValue ?? uiCopy.step1DemoAmount}
                      onChange={(e) => setDemoIncomeValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setDemoIncomeEditing(false);
                        }
                      }}
                      aria-label={t.netIncome}
                      autoFocus
                      className="flex-1 min-w-0 bg-white text-slate-900 rounded-xl px-3 py-1.5 text-base font-black tabular-nums focus:outline-hidden focus:ring-2 focus:ring-sky-300"
                    />
                    <button
                      type="submit"
                      className="min-w-[40px] min-h-[40px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      aria-label={t.confirmAmount}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDemoIncomeValue((prev) => prev && prev.trim() ? prev : uiCopy.step1DemoAmount);
                      setDemoIncomeEditing(true);
                    }}
                    className="group flex items-center gap-2 text-left cursor-pointer focus-visible:outline-hidden"
                  >
                    <span className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums group-hover:underline underline-offset-4 decoration-white/50">
                      {demoIncomeValue && demoIncomeValue.trim() ? demoIncomeValue : uiCopy.step1DemoAmount}
                    </span>
                    <Pencil className="w-4 h-4 text-sky-200 group-hover:text-white transition-colors" />
                  </button>
                )}

                <div className="pt-2.5 border-t border-white/20 flex items-center justify-between gap-2 text-xs">
                  <span className="text-blue-100 font-semibold">{t.variableExpenses}</span>
                  <span className="font-black tabular-nums text-white">{uiCopy.step1DemoVariableAmount}</span>
                </div>
              </div>
            )}

            {currentStep.id === 2 && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDemoExpensePaid((prev) => !prev)}
                    className="flex items-center gap-2.5 text-left min-w-0 flex-1 min-h-[44px] cursor-pointer group focus-visible:outline-hidden"
                  >
                    {demoExpensePaid ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-sky-400 shrink-0 transition-colors" />
                    )}
                    <div className="min-w-0">
                      <span
                        className={`font-bold block truncate ${
                          demoExpensePaid
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {uiCopy.step2DemoConcept}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {uiCopy.step2DemoDueLabel} ·{' '}
                        <span
                          className={
                            demoExpensePaid
                              ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                              : 'text-amber-700 dark:text-amber-400 font-bold'
                          }
                        >
                          {demoExpensePaid ? t.paidStatus : t.pendingStatus}
                        </span>
                      </span>
                    </div>
                  </button>

                  <div className="text-right shrink-0">
                    <span className="font-black text-sm text-slate-900 dark:text-white tabular-nums block">
                      {uiCopy.step2DemoAmount}
                    </span>
                    <span className="text-[10px] text-sky-700 dark:text-sky-400 font-semibold">
                      {uiCopy.step2DemoToggleHint}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <Bell className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>{uiCopy.step2AlertRangeNote}</span>
                </div>
              </div>
            )}

            {currentStep.id === 3 && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-3">
                {/* Selector interactivo real de ubicación de Días Extras */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {uiCopy.step3ToggleHint}
                  </span>
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setDemoExtraPos('start')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        demoExtraPos === 'start'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t.extraDaysFirst}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoExtraPos('end')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        demoExtraPos === 'end'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {t.extraDaysLast}
                    </button>
                  </div>
                </div>

                {/* Representación visual fiel de los 5 Frascos */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {orderedDemoJars.map((jar) => {
                    const isCurrent = 'isCurrent' in jar && jar.isCurrent;
                    const isExtra = 'isExtra' in jar && jar.isExtra;
                    const isZeroAvailable = jar.pct === 100;
                    return (
                      <div
                        key={jar.id}
                        className={`rounded-xl border p-2.5 flex flex-col justify-between gap-1.5 transition-colors ${
                          isCurrent
                            ? 'bg-sky-50/70 dark:bg-sky-950/40 border-sky-500 dark:border-sky-400'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <JarIcon
                            className={`w-4 h-4 shrink-0 ${
                              isCurrent
                                ? 'text-sky-600 dark:text-sky-400'
                                : isExtra
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-slate-500 dark:text-slate-300'
                            }`}
                          />
                          <span
                            className={`text-[10px] font-bold truncate ${
                              isCurrent
                                ? 'text-sky-700 dark:text-sky-300'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {isCurrent
                              ? t.inProgress
                              : isExtra
                              ? uiCopy.step3DemoExtraDaysCount
                              : uiCopy.step3DemoWeekDaysCount}
                          </span>
                        </div>

                        <div>
                          <span
                            className={`text-[11px] font-black block truncate ${
                              isCurrent
                                ? 'text-sky-700 dark:text-sky-300'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {jar.title}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 block mt-0.5 truncate">
                            {t.available}
                          </span>
                          <span
                            className={`text-xs font-black tabular-nums block ${
                              isZeroAvailable
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {jar.available}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isZeroAvailable
                                  ? 'bg-amber-500'
                                  : isCurrent
                                  ? 'bg-sky-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${jar.pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums block truncate">
                            {t.spent} {jar.spent} ({jar.pct}%)
                          </span>
                        </div>

                        <div className="pt-1 border-t border-slate-100 dark:border-slate-700/70">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate">
                            {t.assignedAmount}
                          </span>
                          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tabular-nums block">
                            {jar.assigned}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep.id === 4 && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="flex-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                        {uiCopy.step4DemoMerchant}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                        {uiCopy.step4DemoCategory}
                      </span>
                    </div>
                    <span className="text-xs font-black text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                      {uiCopy.step4DemoAmount}
                    </span>
                  </div>

                  <div className="flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                    <ArrowRight className="hidden sm:block w-4 h-4" />
                    <ArrowDown className="sm:hidden w-4 h-4" />
                  </div>

                  <div className="flex-1 rounded-xl bg-sky-50/70 dark:bg-sky-950/35 border border-sky-300 dark:border-sky-700 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <span className="font-black text-sky-800 dark:text-sky-300">
                        {t.jarWeekPrefix} 2 · {t.inProgress}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 line-through tabular-nums">
                        {uiCopy.step4DemoBefore}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {t.available}
                      </span>
                      <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {uiCopy.step4DemoAfter}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {uiCopy.step4ExampleText}
                </p>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-[11px] text-rose-700 dark:text-rose-300 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>{uiCopy.step4OverbudgetNote}</span>
                </div>
              </div>
            )}

            {currentStep.id === 5 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { icon: Sun, secondaryIcon: Moon, item: uiCopy.step5Items[0] },
                  { icon: Globe, secondaryIcon: Coins, item: uiCopy.step5Items[1] },
                  { icon: Bell, secondaryIcon: null, item: uiCopy.step5Items[2] },
                  { icon: Smartphone, secondaryIcon: RefreshCw, item: uiCopy.step5Items[3] },
                ].map((entry, idx) => {
                  const Icon = entry.icon;
                  const SecondaryIcon = entry.secondaryIcon;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5"
                    >
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-sky-400 shrink-0 flex items-center gap-1">
                        <Icon className="w-4 h-4" />
                        {SecondaryIcon && <SecondaryIcon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300" />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          {entry.item.title}
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 block mt-0.5 leading-snug">
                          {entry.item.desc}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tarjetas explicativas concisas (2 a 4 puntos por paso) */}
            <div className="space-y-2.5">
              {currentStep.highlights.map((h, i) => {
                const HIcon = h.icon;
                return (
                  <div
                    key={i}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-start gap-3"
                  >
                    <div className="p-2 rounded-xl bg-blue-100/70 dark:bg-slate-800 text-blue-700 dark:text-sky-400 shrink-0 mt-0.5">
                      <HIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                        {h.title}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 block leading-relaxed">
                        {h.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Aclaración destacada obligatoria en Paso 1 */}
            {currentStep.id === 1 && (
              <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-slate-900 border border-sky-200 dark:border-sky-800/80 text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{uiCopy.step1Disclaimer}</span>
              </div>
            )}

            {/* Consejo práctico en pasos que correspondan */}
            {currentStep.tip && (
              <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
                <Lightbulb className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{currentStep.tip}</span>
              </div>
            )}

            {/* Mensaje final obligatorio en Paso 5 */}
            {currentStep.id === 5 && (
              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-blue-800/80 text-xs sm:text-sm text-slate-800 dark:text-slate-100 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <span className="font-bold leading-relaxed">{uiCopy.step5ClosingMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Pie de navegación adaptado a pantallas desde 320px y traducciones extensas */}
        <div className="px-3 py-3 sm:px-6 sm:py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3">
          {/* Indicadores de progreso seleccionables (fila superior centrada en móvil <640px, centro en sm+) */}
          <div
            className="w-full sm:w-auto order-first sm:order-2 flex items-center justify-center gap-1.5"
            aria-label={uiCopy.headerTitle}
          >
            {steps.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className="p-1.5 cursor-pointer flex items-center justify-center rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={t.stepOf
                  .replace('{current}', String(idx + 1))
                  .replace('{total}', String(steps.length))}
              >
                <span
                  className={`h-2 rounded-full transition-all block ${
                    idx === activeStepIndex
                      ? 'w-6 bg-blue-600 dark:bg-sky-400'
                      : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
                  }`}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirst}
            className={`order-1 sm:order-1 flex-1 sm:flex-initial min-w-0 min-h-[44px] flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isFirst
                ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                : 'cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.stepPrev}</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="order-2 sm:order-3 flex-1 sm:flex-initial min-w-0 min-h-[44px] flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl text-[11px] sm:text-xs font-extrabold transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="truncate">{isLast ? t.stepFinish : t.stepNext}</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
