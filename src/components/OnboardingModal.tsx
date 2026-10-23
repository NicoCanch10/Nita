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
  Bell, 
  Calendar,
  Sparkles
} from 'lucide-react';
import { JarIcon } from './JarIcon';
import { getTranslations } from '../utils/languages';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  language?: string;
}

interface StepInfo {
  id: number;
  tabLabel: string;
  icon: React.ElementType;
  title: string;
  description: string;
  highlights: { title: string; desc: string; icon?: React.ElementType }[];
  tip?: string;
}

const STEPS: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Ingreso',
    icon: Wallet,
    title: 'Paso 1: Cargar tu Ingreso Neto Mensual',
    description: 'NITA parte de tu dinero neto real disponible para organizar todo tu mes con centavos exactos.',
    highlights: [
      {
        title: 'Tarjeta Principal',
        desc: 'En la tarjeta destacada superior verás el apartado "Ingreso Neto Mensual", con tus Gastos Variables calculados automáticamente debajo.',
        icon: Wallet,
      },
      {
        title: 'Editar valor',
        desc: 'Haz clic o toca directamente sobre el número para escribir el importe total de tus ingresos y presiona el botón de confirmación (✓) o Enter.',
        icon: Sparkles,
      },
    ],
    tip: 'Inicia en $0 para que ingreses tu monto personalizado. Puedes modificarlo las veces que lo necesites.',
  },
  {
    id: 2,
    tabLabel: '2. Vencimientos',
    icon: Receipt,
    title: 'Paso 2: Gastos Fijos y Vencimientos',
    description: 'Registra tus obligaciones recurrentes (alquiler, servicios, tarjetas, préstamos) y programa alertas automáticas.',
    highlights: [
      {
        title: 'Agregar gasto y día',
        desc: 'Ingresa el concepto, monto y en la casilla "Vence día" coloca el número del día (del 1 al 31) en que debe pagarse.',
        icon: Calendar,
      },
      {
        title: 'Alertas automáticas preventivas',
        desc: 'La campana de alertas te notificará 3 días antes y el mismo día del vencimiento en tu pantalla o celular para evitar recargos.',
        icon: Bell,
      },
      {
        title: 'Control de pago',
        desc: 'Toca el círculo para marcar como "Pagado" cada gasto una vez abonado.',
        icon: Check,
      },
    ],
    tip: 'Los gastos fijos se restan automáticamente de tu ingreso para proteger el dinero de tus compromisos obligatorios.',
  },
  {
    id: 3,
    tabLabel: '3. Los 5 Frascos',
    icon: JarIcon,
    title: 'Paso 3: El Método de los 5 Frascos Semanales',
    description: 'Tu dinero libre restante se divide automáticamente en 5 frascos calculados con el calendario real del mes.',
    highlights: [
      {
        title: 'Días Extras',
        desc: 'Cubre los días excedentes del mes (ej. 3 días en un mes de 31). Puedes elegir si ubicarlos adelante de todo (inicio) o detrás de todo (final).',
        icon: JarIcon,
      },
      {
        title: 'Semana 1, Semana 2, Semana 3 y Semana 4',
        desc: 'Las 4 semanas exactas de 7 días tienen un presupuesto equitativo asignado para tus consumos.',
        icon: Calendar,
      },
      {
        title: 'Saldo en tiempo real',
        desc: 'Cada frasco destaca su saldo "Disponible", el monto gastado y la barra de progreso.',
        icon: Sparkles,
      },
    ],
    tip: 'El frasco de la semana en curso se resalta automáticamente en color para que sepas exactamente cuánto puedes gastar hoy.',
  },
  {
    id: 4,
    tabLabel: '4. Gastos Diarios',
    icon: ShoppingBag,
    title: 'Paso 4: Control de Gastos Diarios y Variables',
    description: 'Anota tus compras cotidianas para mantener el equilibrio financiero semanal.',
    highlights: [
      {
        title: 'Carga rápida diaria',
        desc: 'Registra compras de supermercado, delivery, combustible o salidas seleccionando la fecha, monto y categoría.',
        icon: ShoppingBag,
      },
      {
        title: 'Impacto automático',
        desc: 'El gasto se imputa al frasco de la semana correspondiente, actualizando tu saldo disponible al instante.',
        icon: Check,
      },
    ],
    tip: 'Si un frasco se excede, el sistema te alertará en color rojo para que ajustes los consumos en los siguientes días.',
  },
  {
    id: 5,
    tabLabel: '5. Ajustes y App',
    icon: Settings,
    title: 'Paso 5: Rueda de Configuraciones y App',
    description: 'Personaliza tu experiencia con Modo Oscuro, monedas y descarga en tu dispositivo.',
    highlights: [
      {
        title: 'Modo Oscuro (Luna) y Blanco (Sol)',
        desc: 'En la rueda de configuraciones ⚙️ puedes cambiar entre vista oscura o clara con un solo toque.',
        icon: Settings,
      },
      {
        title: 'Instalar como App en celular o PC',
        desc: 'Agrégala a tu pantalla de inicio para usarla a pantalla completa como una app nativa, incluso sin conexión.',
        icon: Sparkles,
      },
      {
        title: 'Actualizaciones automáticas',
        desc: 'Si se añaden mejoras o funciones, recibirás la actualización inmediatamente en tu aplicación.',
        icon: Check,
      },
    ],
    tip: '¡Listo! Puedes volver a abrir este instructivo en cualquier momento desde la rueda de configuraciones.',
  },
];

const STEPS_EN: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Income',
    icon: Wallet,
    title: 'Step 1: Enter Net Monthly Income',
    description: 'NITA uses your real net available income to organize your entire month with exact precision.',
    highlights: [
      {
        title: 'Main KPI Card',
        desc: 'At the top card you will find "Net Monthly Income", with your Variable Expenses automatically computed below.',
        icon: Wallet,
      },
      {
        title: 'Edit Amount',
        desc: 'Click directly on the amount to enter your total net income and press check (✓) or Enter.',
        icon: Sparkles,
      },
    ],
    tip: 'Starts at $0 so you can enter your exact income. You can modify it whenever needed.',
  },
  {
    id: 2,
    tabLabel: '2. Due Dates',
    icon: Receipt,
    title: 'Step 2: Fixed Expenses & Due Dates',
    description: 'Record your recurring obligations (rent, utilities, cards, loans) and schedule automatic advance alerts.',
    highlights: [
      {
        title: 'Add Expense & Due Day',
        desc: 'Enter concept, amount, and in the "Due day" field enter the day number (1-31) when it is due.',
        icon: Calendar,
      },
      {
        title: 'Automatic Alerts',
        desc: 'The notification bell alerts you days before and on the due date so you never miss a payment.',
        icon: Bell,
      },
      {
        title: 'Payment Tracking',
        desc: 'Tap the circle to mark each expense as "Paid" once completed.',
        icon: Check,
      },
    ],
    tip: 'Fixed expenses are automatically deducted from your income to protect money for required bills.',
  },
  {
    id: 3,
    tabLabel: '3. The 5 Jars',
    icon: JarIcon,
    title: 'Step 3: The 5 Weekly Jars Method',
    description: 'Your remaining variable budget is divided into 5 jars tailored to the real calendar of the month.',
    highlights: [
      {
        title: 'Extra Days',
        desc: 'Covers extra days beyond 28 (e.g. 3 days in a 31-day month). Choose to place them at the start or end of the month.',
        icon: JarIcon,
      },
      {
        title: 'Weeks 1, 2, 3 and 4',
        desc: 'The 4 exact 7-day weeks receive an equal budget assigned for your lifestyle and daily spending.',
        icon: Calendar,
      },
      {
        title: 'Real-time Balance',
        desc: 'Each jar shows its "Available" balance, spent amount, and visual progress bar.',
        icon: Sparkles,
      },
    ],
    tip: 'The active week jar highlights in color so you always know exactly how much you can spend today.',
  },
  {
    id: 4,
    tabLabel: '4. Daily Expenses',
    icon: ShoppingBag,
    title: 'Step 4: Tracking Daily & Variable Expenses',
    description: 'Log your everyday purchases to keep weekly financial balance.',
    highlights: [
      {
        title: 'Quick Entry',
        desc: 'Log supermarket, dining, fuel, or leisure purchases by picking date, amount, and category.',
        icon: ShoppingBag,
      },
      {
        title: 'Instant Impact',
        desc: 'Expenses are automatically assigned to the corresponding weekly jar, updating your available balance.',
        icon: Check,
      },
    ],
    tip: 'If a jar exceeds budget, it highlights in red so you can adjust spending in the next days.',
  },
  {
    id: 5,
    tabLabel: '5. Settings & App',
    icon: Settings,
    title: 'Step 5: Settings Wheel & Offline App',
    description: 'Customize your experience with Dark Mode, currencies, and install to your device.',
    highlights: [
      {
        title: 'Dark / Light Mode',
        desc: 'In the settings wheel ⚙️ toggle between dark and light themes with a single tap.',
        icon: Settings,
      },
      {
        title: 'Install as App',
        desc: 'Add to your home screen to use full screen like a native app, even offline.',
        icon: Sparkles,
      },
      {
        title: 'Automatic Updates',
        desc: 'When improvements are published, your app updates automatically.',
        icon: Check,
      },
    ],
    tip: 'Done! You can reopen this guide anytime from the settings wheel.',
  },
];

const STEPS_CA: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Ingrés',
    icon: Wallet,
    title: 'Pas 1: Carregar el teu Ingrés Net Mensual',
    description: 'NITA parteix dels teus diners nets reals disponibles per organitzar tot el teu mes amb cèntims exactes.',
    highlights: [
      {
        title: 'Targeta Principal',
        desc: 'A la targeta destacada superior veuràs l\'apartat "Ingrés Net Mensual", amb les teves Despeses Variables calculades automàticament a sota.',
        icon: Wallet,
      },
      {
        title: 'Modificar valor',
        desc: 'Fes clic o toca directament sobre el número per escriure l\'import total dels teus ingressos i prem el botó de confirmació (✓) o Enter.',
        icon: Sparkles,
      },
    ],
    tip: 'Comença en $0 perquè introdueixis el teu import personalitzat. Pots modificar-lo les vegades que ho necessitis.',
  },
  {
    id: 2,
    tabLabel: '2. Venciments',
    icon: Receipt,
    title: 'Pas 2: Despeses Fixes i Venciments',
    description: 'Registra les teves obligacions recurrents (lloguer, serveis, targetes, préstecs) i programa alertes automàtiques.',
    highlights: [
      {
        title: 'Afegir despesa i dia',
        desc: 'Introdueix el concepte, import i a la casella "Venç dia" col·loca el número del dia (de l\'1 al 31) en què s\'ha de pagar.',
        icon: Calendar,
      },
      {
        title: 'Alertes automàtiques preventives',
        desc: 'La campana d\'alertes et notificarà dies abans i el mateix dia del venciment a la teva pantalla o mòbil per evitar recàrrecs.',
        icon: Bell,
      },
      {
        title: 'Control de pagament',
        desc: 'Toca el cercle per marcar com a "Pagat" cada despesa un cop abonada.',
        icon: Check,
      },
    ],
    tip: 'Les despeses fixes es resten automàticament del teu ingrés per protegir els diners dels teus compromisos obligatoris.',
  },
  {
    id: 3,
    tabLabel: '3. Els 5 Pots',
    icon: JarIcon,
    title: 'Pas 3: El Mètode dels 5 Pots Setmanals',
    description: 'Els teus diners lliures restants es divideixen automàticament en 5 pots calculats amb el calendari real del mes.',
    highlights: [
      {
        title: 'Dies Extres',
        desc: 'Cobreix els dies excedents del mes (ex. 3 dies en un mes de 31). Pots triar si ubicar-los davant de tot (inici) o darrere de tot (final).',
        icon: JarIcon,
      },
      {
        title: 'Setmana 1, Setmana 2, Setmana 3 i Setmana 4',
        desc: 'Les 4 setmanes exactes de 7 dies tenen un pressupost equitatiu assignat per als teus consums.',
        icon: Calendar,
      },
      {
        title: 'Saldo en temps real',
        desc: 'Cada pot destaca el seu saldo "Disponible", l\'import gastat i la barra de progrés.',
        icon: Sparkles,
      },
    ],
    tip: 'El pot de la setmana en curs es ressalta automàticament en color perquè sàpigues exactament quant pots gastar avui.',
  },
  {
    id: 4,
    tabLabel: '4. Despeses Diàries',
    icon: ShoppingBag,
    title: 'Pas 4: Consums Diaris i Seguiment',
    description: 'Apunta les teves compres quotidianes per mantenir l\'equilibri financer setmanal.',
    highlights: [
      {
        title: 'Càrrega ràpida diària',
        desc: 'Registra compres de supermercat, menjar, combustible o sortides seleccionant la data, import i categoria.',
        icon: ShoppingBag,
      },
      {
        title: 'Impacte automàtic',
        desc: 'La despesa s\'imputa al pot de la setmana corresponent, actualitzant el teu saldo disponible a l\'instant.',
        icon: Check,
      },
    ],
    tip: 'Si un pot s\'excedeix, el sistema t\'alertarà en vermell perquè ajustis els consums en els dies següents.',
  },
  {
    id: 5,
    tabLabel: '5. Ajustos i App',
    icon: Settings,
    title: 'Pas 5: Roda de Configuracions i App',
    description: 'Personalitza la teva experiència amb Mode Fosc, monedes i descàrrega al teu dispositiu.',
    highlights: [
      {
        title: 'Mode Fosc (Lluna) i Blanc (Sol)',
        desc: 'A la roda de configuracions ⚙️ pots canviar entre vista fosca o clara amb un sol toc.',
        icon: Settings,
      },
      {
        title: 'Instal·lar com a App al mòbil o PC',
        desc: 'Afegeix-la a la teva pantalla d\'inici per utilitzar-la a pantalla completa com una app nativa, fins i tot sense connexió.',
        icon: Sparkles,
      },
      {
        title: 'Actualitzacions automàtiques',
        desc: 'Quan es publiquin millores o funcions, rebràs l\'actualització automàticament a la teva aplicació.',
        icon: Check,
      },
    ],
    tip: 'Fet! Pots tornar a obrir aquesta guia en qualsevol moment des de la roda de configuracions.',
  },
];

const STEPS_PT: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Renda',
    icon: Wallet,
    title: 'Passo 1: Inserir sua Renda Líquida Mensal',
    description: 'O NITA parte do seu dinheiro líquido real disponível para organizar todo o seu mês com centavos exatos.',
    highlights: [
      {
        title: 'Cartão Principal',
        desc: 'No cartão em destaque superior verá a seção "Renda Líquida Mensal", com seus Gastos Variáveis calculados automaticamente abaixo.',
        icon: Wallet,
      },
      {
        title: 'Editar valor',
        desc: 'Clique ou toque diretamente no número para digitar o valor total dos seus rendimentos e pressione o botão de confirmação (✓) ou Enter.',
        icon: Sparkles,
      },
    ],
    tip: 'Começa em $0 para que você insira o seu valor personalizado. Pode modificá-lo quantas vezes precisar.',
  },
  {
    id: 2,
    tabLabel: '2. Vencimentos',
    icon: Receipt,
    title: 'Passo 2: Gastos Fixos e Vencimentos',
    description: 'Registre suas obrigações recorrentes (aluguel, contas, cartões, empréstimos) e programe alertas automáticos.',
    highlights: [
      {
        title: 'Adicionar despesa e dia',
        desc: 'Insira a descrição, valor e no campo "Vencimento" coloque o dia do mês (1 a 31) em que deve ser paga.',
        icon: Calendar,
      },
      {
        title: 'Alertas automáticos preventivos',
        desc: 'O sino de alertas notificará você dias antes e no próprio dia do vencimento em sua tela ou celular para evitar juros.',
        icon: Bell,
      },
      {
        title: 'Controle de pagamento',
        desc: 'Toque no círculo para marcar como "Pago" cada gasto após quitado.',
        icon: Check,
      },
    ],
    tip: 'Os gastos fixos são subtraídos automaticamente da sua renda para proteger o dinheiro dos seus compromisos obrigatórios.',
  },
  {
    id: 3,
    tabLabel: '3. Os 5 Potes',
    icon: JarIcon,
    title: 'Passo 3: O Método dos 5 Potes Semanais',
    description: 'Seu dinheiro livre restante é dividido automaticamente em 5 potes calculados com base no calendário real do mês.',
    highlights: [
      {
        title: 'Dias Extras',
        desc: 'Cobre os dias excedentes do mês (ex. 3 dias num mês de 31). Você pode escolher posicioná-los no início ou no fim do mês.',
        icon: JarIcon,
      },
      {
        title: 'Semana 1, Semana 2, Semana 3 e Semana 4',
        desc: 'As 4 semanas exatas de 7 dias têm um orçamento equitativo atribuído para os seus consumos.',
        icon: Calendar,
      },
      {
        title: 'Saldo em tempo real',
        desc: 'Cada pote destaca seu saldo "Disponível", o valor gasto e a barra de progresso.',
        icon: Sparkles,
      },
    ],
    tip: 'O pote da semana em curso é destacado automaticamente em cores para que você saiba exatamente quanto pode gastar hoje.',
  },
  {
    id: 4,
    tabLabel: '4. Gastos Diários',
    icon: ShoppingBag,
    title: 'Passo 4: Controle de Gastos Diários e Variáveis',
    description: 'Anote suas compras do dia a dia para manter o equilíbrio financeiro semanal.',
    highlights: [
      {
        title: 'Lançamento rápido diário',
        desc: 'Registre compras de supermercado, delivery, combustível ou lazer selecionando a data, valor e categoria.',
        icon: ShoppingBag,
      },
      {
        title: 'Impacto automático',
        desc: 'O gasto é atribuído ao pote da semana correspondente, atualizando seu saldo disponível instantaneamente.',
        icon: Check,
      },
    ],
    tip: 'Se um pote ultrapassar o limite, o sistema alertará em vermelho para que você ajuste os gastos nos dias seguintes.',
  },
  {
    id: 5,
    tabLabel: '5. Ajustes e App',
    icon: Settings,
    title: 'Passo 5: Menu de Configurações e App',
    description: 'Personalize sua experiência com Modo Escuro, moedas e instale no seu dispositivo.',
    highlights: [
      {
        title: 'Modo Escuro (Lua) e Claro (Sol)',
        desc: 'Na roda de configurações ⚙️ alterne entre tema claro e escuro com apenas um toque.',
        icon: Settings,
      },
      {
        title: 'Instalar como App no celular ou PC',
        desc: 'Adicione à tela inicial para usar em tela cheia como um app nativo, mesmo sem conexão.',
        icon: Sparkles,
      },
      {
        title: 'Atualizações automáticas',
        desc: 'Quando novas melhorias forem publicadas, seu app será atualizado automaticamente.',
        icon: Check,
      },
    ],
    tip: 'Pronto! Você pode reabrir este manual a qualquer momento no menu de configurações.',
  },
];

const STEPS_FR: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Revenu',
    icon: Wallet,
    title: 'Étape 1 : Saisir votre Revenu Net Mensuel',
    description: 'NITA se base sur votre revenu net réel disponible pour organiser tout votre mois au centime près.',
    highlights: [
      {
        title: 'Carte Principale',
        desc: 'Sur la carte du haut, vous trouverez la section "Revenu Net Mensuel", avec vos Dépenses Variables calculées automatiquement en dessous.',
        icon: Wallet,
      },
      {
        title: 'Modifier le montant',
        desc: 'Cliquez ou appuyez directement sur le montant pour saisir vos revenus totaux et validez avec (✓) ou Entrée.',
        icon: Sparkles,
      },
    ],
    tip: 'Commence à 0 $ pour vous permettre de saisir votre montant exact. Modifiable à tout moment.',
  },
  {
    id: 2,
    tabLabel: '2. Échéances',
    icon: Receipt,
    title: 'Étape 2 : Dépenses Fixes et Échéances',
    description: 'Enregistrez vos charges récurrentes (loyer, factures, cartes, prêts) et programmez des alertes automatiques.',
    highlights: [
      {
        title: 'Ajouter dépense et jour',
        desc: 'Entrez l\'intitulé, le montant et dans la case "Échéance" indiquez le jour du mois (1 à 31) auquel elle doit être payée.',
        icon: Calendar,
      },
      {
        title: 'Alertes préventives automatiques',
        desc: 'La cloche d\'alerte vous avertit quelques jours avant et le jour même pour éviter tout retard ou pénalité.',
        icon: Bell,
      },
      {
        title: 'Suivi des paiements',
        desc: 'Touchez le cercle pour marquer chaque dépense comme "Payée" une fois réglée.',
        icon: Check,
      },
    ],
    tip: 'Les charges fixes sont déduites automatiquement de votre revenu afin de sanctuariser l\'argent nécessaire à vos factures.',
  },
  {
    id: 3,
    tabLabel: '3. Les 5 Bocaux',
    icon: JarIcon,
    title: 'Étape 3 : La Méthode des 5 Bocaux Hebdomadaires',
    description: 'Votre budget disponible restant est réparti automatiquement en 5 bocaux calculés selon le calendrier réel du mois.',
    highlights: [
      {
        title: 'Jours Supplémentaires',
        desc: 'Couvre les jours excédentaires (ex. 3 jours dans un mois de 31). Vous pouvez les placer en début ou en fin de mois.',
        icon: JarIcon,
      },
      {
        title: 'Semaines 1, 2, 3 et 4',
        desc: 'Les 4 semaines exactes de 7 jours bénéficient d\'un budget équitablement alloué pour votre vie quotidienne.',
        icon: Calendar,
      },
      {
        title: 'Solde en temps réel',
        desc: 'Chaque bocal affiche clairement son solde "Disponible", le montant dépensé et la barre de progression.',
        icon: Sparkles,
      },
    ],
    tip: 'Le bocal de la semaine en cours s\'affiche en surbrillance colorée pour savoir immédiatement combien vous pouvez dépenser aujourd\'hui.',
  },
  {
    id: 4,
    tabLabel: '4. Dépenses Quotidiennes',
    icon: ShoppingBag,
    title: 'Étape 4 : Gestion des Dépenses Quotidiennes et Variables',
    description: 'Notez vos achats quotidiens pour préserver votre équilibre financier tout au long de la semaine.',
    highlights: [
      {
        title: 'Saisie rapide journalière',
        desc: 'Enregistrez vos courses, repas, carburant ou sorties en indiquant la date, le montant et la catégorie.',
        icon: ShoppingBag,
      },
      {
        title: 'Impact instantané',
        desc: 'La dépense est automatiquement affectée au bocal de la semaine concernée, actualisant votre solde disponible.',
        icon: Check,
      },
    ],
    tip: 'Si un bocal dépasse son budget, il s\'affiche en rouge pour vous inviter à ajuster vos dépenses les jours suivants.',
  },
  {
    id: 5,
    tabLabel: '5. Paramètres & App',
    icon: Settings,
    title: 'Étape 5 : Menu Paramètres et Application',
    description: 'Personnalisez votre expérience avec le Mode Sombre, les devises et installez l\'application sur votre appareil.',
    highlights: [
      {
        title: 'Mode Sombre (Lune) et Clair (Soleil)',
        desc: 'Dans la roue des paramètres ⚙️, passez du thème sombre au thème clair d\'un simple clic.',
        icon: Settings,
      },
      {
        title: 'Installer l\'App sur mobile ou PC',
        desc: 'Ajoutez-la à votre écran d\'accueil pour l\'utiliser en plein écran comme une application native, même hors ligne.',
        icon: Sparkles,
      },
      {
        title: 'Mises à jour automatiques',
        desc: 'Dès que des améliorations sont déployées, votre application est mise à jour immédiatement.',
        icon: Check,
      },
    ],
    tip: 'C\'est prêt ! Vous pouvez rouvrir ce guide à tout moment depuis la roue des paramètres.',
  },
];

const STEPS_IT: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Entrate',
    icon: Wallet,
    title: 'Passo 1: Inserisci il tuo Reddito Netto Mensile',
    description: 'NITA parte dal tuo reddito netto reale disponibile per organizzare l\'intero mese al centesimo.',
    highlights: [
      {
        title: 'Scheda Principale',
        desc: 'Nella scheda in alto troverai la voce "Reddito Netto Mensile", con le Spese Variabili calcolate automaticamente sotto.',
        icon: Wallet,
      },
      {
        title: 'Modifica importo',
        desc: 'Clicca o tocca direttamente sul numero per digitare le tue entrate totali e premi il tasto di conferma (✓) o Invio.',
        icon: Sparkles,
      },
    ],
    tip: 'Parte da 0 $ per consentirti di inserire il tuo importo esatto. Modificabile ogni volta che serve.',
  },
  {
    id: 2,
    tabLabel: '2. Scadenze',
    icon: Receipt,
    title: 'Passo 2: Spese Fisse e Scadenze',
    description: 'Registra i tuoi impegni ricorrenti (affitto, bollette, carte, finanziamenti) e programma avvisi automatici.',
    highlights: [
      {
        title: 'Aggiungi spesa e giorno',
        desc: 'Inserisci descrizione, importo e nel campo "Scadenza" indica il giorno del mese (da 1 a 31) in cui pagare.',
        icon: Calendar,
      },
      {
        title: 'Avvisi preventivi automatici',
        desc: 'La campanella ti avviserà giorni prima e il giorno stesso della scadenza per evitare ritardi o more.',
        icon: Bell,
      },
      {
        title: 'Controllo pagamenti',
        desc: 'Tocca il cerchio per contrassegnare come "Pagata" ogni spesa dopo il saldo.',
        icon: Check,
      },
    ],
    tip: 'Le spese fisse vengono detratte automaticamente dal reddito per proteggere il denaro destinato ai tuoi obblighi.',
  },
  {
    id: 3,
    tabLabel: '3. I 5 Barattoli',
    icon: JarIcon,
    title: 'Passo 3: Il Metodo dei 5 Barattoli Settimanali',
    description: 'Il tuo budget rimanente viene suddiviso automaticamente in 5 barattoli calcolati sul calendario reale del mese.',
    highlights: [
      {
        title: 'Giorni Extra',
        desc: 'Copre i giorni eccedenti (es. 3 giorni in un mese di 31). Puoi scegliere se posizionarli all\'inizio o alla fine del mese.',
        icon: JarIcon,
      },
      {
        title: 'Settimane 1, 2, 3 e 4',
        desc: 'Le 4 settimane esatte di 7 giorni ricevono un budget equo per le tue spese di vita quotidiana.',
        icon: Calendar,
      },
      {
        title: 'Saldo in tempo reale',
        desc: 'Ogni barattolo mostra chiaramente il saldo "Disponibile", l\'importo speso e la barra di avanzamento.',
        icon: Sparkles,
      },
    ],
    tip: 'Il barattolo della settimana in corso è evidenziato a colori per sapere esattamente quanto puoi spendere oggi.',
  },
  {
    id: 4,
    tabLabel: '4. Spese Giornaliere',
    icon: ShoppingBag,
    title: 'Passo 4: Monitoraggio Spese Giornaliere e Variabili',
    description: 'Registra i tuoi acquisti quotidiani per mantenere l\'equilibrio finanziario settimanale.',
    highlights: [
      {
        title: 'Inserimento rapido giornaliero',
        desc: 'Registra spese per alimentari, delivery, carburante o svago selezionando data, importo e categoria.',
        icon: ShoppingBag,
      },
      {
        title: 'Impatto immediato',
        desc: 'La spesa viene imputata al barattolo della settimana corrispondente, aggiornando all\'istante il saldo disponibile.',
        icon: Check,
      },
    ],
    tip: 'Se un barattolo supera il limite, il sistema lo segnalerà in rosso per permetterti di bilanciare le spese nei giorni successivi.',
  },
  {
    id: 5,
    tabLabel: '5. Impostazioni & App',
    icon: Settings,
    title: 'Passo 5: Menu Impostazioni e Applicazione',
    description: 'Personalizza la tua esperienza con Tema Scuro, valute e scarica l\'app sul tuo dispositivo.',
    highlights: [
      {
        title: 'Tema Scuro (Luna) e Chiaro (Sole)',
        desc: 'Nel menu impostazioni ⚙️ puoi passare da tema scuro a chiaro con un semplice tocco.',
        icon: Settings,
      },
      {
        title: 'Installa come App su smartphone o PC',
        desc: 'Aggiungila alla schermata iniziale per usarla a schermo intero come un\'app nativa, anche offline.',
        icon: Sparkles,
      },
      {
        title: 'Aggiornamenti automatici',
        desc: 'Quando vengono rilasciate migliorie, la tua applicazione si aggiorna in tempo reale.',
        icon: Check,
      },
    ],
    tip: 'Tutto pronto! Puoi riaprire questa guida in qualsiasi momento dal menu impostazioni.',
  },
];

const STEPS_DE: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Einkommen',
    icon: Wallet,
    title: 'Schritt 1: Monatliches Nettoeinkommen erfassen',
    description: 'NITA geht von Ihrem tatsächlich verfügbaren Nettoeinkommen aus, um den gesamten Monat centgenau zu planen.',
    highlights: [
      {
        title: 'Haupt-KPI-Karte',
        desc: 'Auf der oberen Übersichtskarte finden Sie das "Monatliche Nettoeinkommen" mit den automatisch berechneten variablen Ausgaben darunter.',
        icon: Wallet,
      },
      {
        title: 'Betrag bearbeiten',
        desc: 'Klicken oder tippen Sie direkt auf die Zahl, um Ihre Gesamteinnahmen einzugeben, und bestätigen Sie mit (✓) oder Enter.',
        icon: Sparkles,
      },
    ],
    tip: 'Startet bei 0 $, damit Sie Ihren persönlichen Betrag eintragen können. Jederzeit anpassbar.',
  },
  {
    id: 2,
    tabLabel: '2. Fälligkeiten',
    icon: Receipt,
    title: 'Schritt 2: Fixkosten und Zahlungstermine',
    description: 'Erfassen Sie wiederkehrende Verpflichtungen (Miete, Verträge, Kredite) und planen Sie automatische Benachrichtigungen.',
    highlights: [
      {
        title: 'Ausgabe und Tag hinzufügen',
        desc: 'Geben Sie Zweck, Betrag und im Feld "Fälligkeit" den Kalendertag (1 bis 31) ein, an dem die Zahlung fällig ist.',
        icon: Calendar,
      },
      {
        title: 'Automatische Erinnerungen',
        desc: 'Die Benachrichtigungsglocke erinnert Sie Tage zuvor und am Fälligkeitstag direkt auf Ihrem Gerät.',
        icon: Bell,
      },
      {
        title: 'Zahlungsübersicht',
        desc: 'Tippen Sie auf den Kreis, um eine Ausgabe nach Begleichung als "Bezahlt" zu markieren.',
        icon: Check,
      },
    ],
    tip: 'Fixkosten werden automatisch vom Einkommen abgezogen, um das Geld für feste Zahlungsverpflichtungen zu sichern.',
  },
  {
    id: 3,
    tabLabel: '3. Die 5 Gläser',
    icon: JarIcon,
    title: 'Schritt 3: Die 5-Wochengläser-Methode',
    description: 'Ihr verbleibendes freies Budget wird automatisch auf 5 Gläser aufgeteilt, abgestimmt auf den echten Kalendermonat.',
    highlights: [
      {
        title: 'Zusatztage',
        desc: 'Deckt überzählige Monatstage ab (z. B. 3 Tage in einem 31-Tage-Monat). Platzierbar am Monatsanfang oder Monatsende.',
        icon: JarIcon,
      },
      {
        title: 'Woche 1, Woche 2, Woche 3 und Woche 4',
        desc: 'Die 4 exakten 7-Tage-Wochen erhalten jeweils ein gleichmäßiges Budget für Ihre alltäglichen Ausgaben.',
        icon: Calendar,
      },
      {
        title: 'Echtzeit-Saldo',
        desc: 'Jedes Glas zeigt übersichtlich das "Verfügbare" Guthaben, die bisherigen Ausgaben und den Fortschrittsbalken.',
        icon: Sparkles,
      },
    ],
    tip: 'Das Glas der aktuellen Woche wird farblich hervorgehoben, damit Sie stets genau wissen, wie viel Sie heute ausgeben können.',
  },
  {
    id: 4,
    tabLabel: '4. Tägliche Ausgaben',
    icon: ShoppingBag,
    title: 'Schritt 4: Tägliche & variable Ausgaben erfassen',
    description: 'Notieren Sie Ihre alltäglichen Einkäufe, um die finanzielle Balance über alle Wochen zu wahren.',
    highlights: [
      {
        title: 'Schnelle tägliche Erfassung',
        desc: 'Tragen Sie Einkäufe, Lieferdienste, Tanken oder Freizeit mit Datum, Betrag und Kategorie ein.',
        icon: ShoppingBag,
      },
      {
        title: 'Sofortige Verrechnung',
        desc: 'Die Ausgabe wird automatisch dem entsprechenden Wochenglas zugeordnet und aktualisiert sofort Ihr Guthaben.',
        icon: Check,
      },
    ],
    tip: 'Sollte ein Glas überzogen werden, warnt das System in Rot, damit Sie Ihre Ausgaben in den Folgetagen anpassen können.',
  },
  {
    id: 5,
    tabLabel: '5. Einstellungen & App',
    icon: Settings,
    title: 'Schritt 5: Einstellungsmenü und App',
    description: 'Personalisieren Sie Ihr Erlebnis mit Dunkelmodus, Währungen und installieren Sie die App auf Ihrem Gerät.',
    highlights: [
      {
        title: 'Dunkel- (Mond) & Hellmodus (Sonne)',
        desc: 'Im Einstellungsrad ⚙️ wechseln Sie mit einem Fingertipp zwischen dunklem und hellem Design.',
        icon: Settings,
      },
      {
        title: 'Als App auf Smartphone oder PC installieren',
        desc: 'Zum Startbildschirm hinzufügen, um NITA wie eine native App im Vollbildmodus und offline zu nutzen.',
        icon: Sparkles,
      },
      {
        title: 'Automatische Updates',
        desc: 'Sobald Verbesserungen veröffentlicht werden, erhält Ihre App die Aktualisierung unmittelbar.',
        icon: Check,
      },
    ],
    tip: 'Fertig! Sie können diesen Leitfaden jederzeit über das Einstellungsrad erneut öffnen.',
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

  // Cada vez que se vuelve a abrir la guía, debe iniciar en el paso 1 (índice 0)
  useEffect(() => {
    if (isOpen) {
      setActiveStepIndex(0);
    }
  }, [isOpen]);

  const t = getTranslations(language);
  const steps = STEPS_MAP[language] || STEPS;

  const isFirst = activeStepIndex === 0;
  const isLast = activeStepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      setActiveStepIndex(0);
      onClose();
    } else {
      setActiveStepIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setActiveStepIndex(prev => prev - 1);
    }
  };

  const handleClose = () => {
    setActiveStepIndex(0);
    onClose();
  };

  // Touch gesture support: Deslizar con el dedo para pasar de un punto al siguiente
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
    // Asegurar que el deslizamiento horizontal sea predominante sobre el desplazamiento vertical
    if (
      elapsedTime < 800 &&
      Math.abs(deltaX) >= minSwipeDistance &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.2
    ) {
      if (deltaX < 0) {
        // Deslizar hacia la izquierda -> avanzar al siguiente paso
        if (activeStepIndex < steps.length - 1) {
          setActiveStepIndex(prev => prev + 1);
        }
      } else {
        // Deslizar hacia la derecha -> volver al paso anterior
        if (activeStepIndex > 0) {
          setActiveStepIndex(prev => prev - 1);
        }
      }
    }
  };

  // Atajos con flechas del teclado
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (activeStepIndex < steps.length - 1) {
          setActiveStepIndex(prev => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (activeStepIndex > 0) {
          setActiveStepIndex(prev => prev - 1);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] transition-colors">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0 shadow-xs flex items-center justify-center p-0.5">
              <img src="/nita-logo.jpg" alt="NITA" className="w-full h-full object-cover rounded-lg" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                {t.onboardingTitle}
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                {t.stepOf.replace('{current}', String(activeStepIndex + 1)).replace('{total}', String(steps.length))}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-label={t.closeModal}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Strip */}
        <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{step.tabLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body with Touch Swipe support */}
        <div 
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 touch-pan-y"
        >
          <div key={currentStep.id} className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-2xs font-extrabold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{t.onboardingTitle}</span>
              </div>
              <h4 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
                {currentStep.title}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                {currentStep.description}
              </p>
            </div>

            {/* Highlights Cards */}
            <div className="space-y-3">
              {currentStep.highlights.map((h, i) => {
                const HIcon = h.icon || Check;
                return (
                  <div
                    key={i}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3"
                  >
                    <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5">
                      <HIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                        {h.title}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 block leading-relaxed">
                        {h.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tip Box */}
            {currentStep.tip && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{currentStep.tip}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirst}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              isFirst
                ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{t.stepPrev}</span>
          </button>

          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === activeStepIndex
                    ? 'w-6 bg-blue-600 dark:bg-blue-500'
                    : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                }`}
                aria-label={t.stepOf.replace('{current}', String(idx + 1)).replace('{total}', String(steps.length))}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <span>{isLast ? t.stepFinish : t.stepNext}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
