import assert from "node:assert/strict";
import test from "node:test";

import { hasSubstantiveCandidateResponseSignal } from "./feedback-language-policy";

test("requires relationship-bearing language instead of PM nouns plus one connector", () => {
  assert.equal(
    hasSubstantiveCandidateResponseSignal(
      "qwerty user product metric market because foobar blargle snorf wibble wobble plugh"
    ),
    false
  );
  assert.equal(
    hasSubstantiveCandidateResponseSignal(
      "I aligned the product and engineering teams because we needed to prioritize user trust before launch."
    ),
    true
  );
});

test("accepts coherent multilingual answers without a translated noun allowlist", () => {
  const cases = [
    "Primero identificaría a los usuarios frecuentes porque necesito entender sus problemas antes de proponer soluciones.",
    "首先我会识别核心用户，因为需要理解他们的问题，然后比较方案并衡量留存率。",
    "まず利用者を理解してから課題を比較し、その後に継続率を測定します。",
    "Primero identificaría a los usuarios frecuentes porque necesito entender sus problemas antes de proponer soluciones. Después compararía opciones para medir el impacto.",
    "Le produit a besoin de comprendre les utilisateurs avant de définir la solution. Notre équipe a choisi de comparer les options pour mesurer leur impact.",
    "Zuerst würde ich die Nutzer in der Forschung verstehen und das Problem definieren. Danach würde unser Team die Optionen in einem Test vergleichen und den Erfolg messen.",
    "A continuación entrevistaría a clientes frecuentes para entender sus necesidades. Después probaría dos opciones antes de elegir una solución.",
    "Primero identificaría a los usuarios frecuentes porque necesito entender sus problemas. A continuación compararía opciones para medir el impacto.",
    "À partir des entretiens, je définirais le problème principal. Ensuite je comparerais les solutions pour mesurer leur impact.",
    "Les familles préfèrent des rappels clairs pendant les changements. Ensuite notre équipe testerait un calendrier partagé pour mesurer son impact.",
    "أنا أفهم احتياجات الأسر لأن التنسيق يتأخر كل أسبوع، ثم أقارن الحلول وأقيس الاحتفاظ قبل الإطلاق.",
    "نحن نحدد مشكلة المستخدم قبل الإطلاق، ثم نختبر حلين ونقيس أثرهما بعد التجربة.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("does not claim multilingual Latin-script fragments as malformed English", () => {
  const text =
    "Alineé diseño e ingeniería antes del lanzamiento. Unternehmenskunden mit hohem Risiko. clients à forte fréquence. وازنت المخاطر بعناية. 優先順位を説明した。";

  assert.equal(hasSubstantiveCandidateResponseSignal(text), true);
});

test("multilingual prefixes do not exempt an owned English clause from validation", () => {
  const spanishContext =
    "Primero identificaría a los usuarios frecuentes porque necesito entender sus problemas antes de proponer soluciones.";

  assert.equal(
    hasSubstantiveCandidateResponseSignal(
      `Porque the team give customer feedback during planning. ${spanishContext}`
    ),
    false
  );
  assert.equal(
    hasSubstantiveCandidateResponseSignal(
      `Porque the team gives customer feedback during planning. ${spanishContext}`
    ),
    true
  );
});

test("accepts ordinary domain reasoning and concise declarative PM answers", () => {
  const cases = [
    "Users struggle to keep track of shifting schedules, so I would centralize changes and notify the relevant caregiver before pickup.",
    "My target user would be working parents with young children because they face frequent coordination problems across multiple caregivers.",
    "For success, the primary metric would be weekly retained households, while guardrails would include notification opt-outs and missed handoffs.",
    "I would speak with nurses because their handoff process creates delays before the night shift.",
    "I would speak with nurses to understand handoffs and observe their night shift.",
    "I would ask nurses about handoff delays during the night shift to understand where work gets stuck.",
    "We spoke with nurses and observed shift handoffs to uncover recurring delays.",
    "I chose nurses as the first segment and observed shift handoffs.",
    "Nurses lose time during shift handoffs, creating missed medication updates.",
    "I would talk to doctors in rural clinics because appointment scheduling is difficult and patients often wait several days for care.",
    "I would interview college students because finding affordable housing near campus takes too long and causes stress before each semester.",
    "I would observe small business owners because reconciling invoices manually wastes hours and delays payroll every month.",
    "I would talk to customers first, then rank their problems by severity.",
    "I would focus on new users because activation is the biggest opportunity.",
    "I would sequence the roadmap by risk because security failures could destroy trust.",
    "I would prioritize returning candidates because failed onboarding creates the clearest confidence risk.",
    "I would prioritize first-time working parents because their cross-team scheduling pain is frequent.",
    "I would compare reach, severity, and implementation effort before prioritizing.",
    "We should investigate churn before committing to a retention feature.",
    "I would start with working parents who struggle to plan recurring household tasks each week.",
    "I would measure weekly retained teams, successful setup completion, and support burden by segment.",
    "For a confidence-building coaching product, the evaluation should contain only strengths for first-time users.",
    "I would measure weekly retention, setup completion, and support burden by customer segment.",
    "I would measure retained customer value with adoption quality and operational guardrail metrics over time.",
    "Busy parents juggle school pickups every afternoon. Schedule changes create fragmented communication across caregivers.",
    "Our target audience consists of busy parents juggling school pickups. Their biggest frustration stems from unpredictable schedule changes and fragmented communication across caregivers.",
    "The strongest opportunity lies in a shared calendar for families. A lightweight notification layer reduces coordination overhead and preserves trust during last-minute changes.",
    "Success depends on weekly active households and completed handoffs. Guardrail metrics include notification fatigue, accidental disclosure rates, and support contacts per household.",
    "Working parents send pickup details in group chats. Last-minute changes confuse caregivers and leave children waiting after school.",
    "Small teams buy software through annual contracts. Security reviews block purchases and extend the sales cycle for months.",
    "Creators upload videos from their phones every evening. Slow reviews frustrate them and discourage future submissions to the platform.",
    "New customers visit the pricing page before signup. Hidden fees surprise them and reduce trust during checkout.",
    "I would observe warehouse pickers because misrouted totes create delays before the loading cutoff.",
    "First I would observe restaurant hosts because seating bottlenecks happen before peak dinner service.",
    "I would interview teachers because grading paperwork consumes planning time before each school day.",
    "Working parents face coordination pain; weekly retention measures whether shared planning creates durable value.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("accepts coherent calibration answers across ordinary clause shapes", () => {
  const cases = [
    "They need a psychologically safe prompt tied to a real upcoming situation rather than more vocabulary cards.",
    "The product should help them describe symptoms safely without encouraging repairs that require a professional.",
    "I would measure correctly routed requests and treat unsafe self-repair attempts as a stopping guardrail.",
    "The first job is confirming the next action in plain language, with escalation back to the care team when uncertain.",
    "If the evidence contradicted the plan, I would narrow scope and record which assumption changed.",
    "For Caregiver planning, I would first define the intended user outcome. After that I would brainstorm features for everyone instead of choosing a user segment.",
    "Existing customers keep their current access until migration evidence and support playbooks are ready.",
    "I would distinguish institutional buyers from individual teachers because procurement and adoption move on different clocks.",
    "The strategy should concentrate one category and geography rather than subsidize broad but unusable inventory.",
    "In the Influence without authority example, I owned one part of a team problem and needed to align two stakeholders with different priorities.",
    "The team completed the work with a better relationship, but the result is only loosely measured and my reflection could be more specific.",
    "I modeled one problem framing, reviewed drafts with questions instead of edits, and gave them ownership of the next executive review.",
    "They led the review successfully and later taught the method to another teammate; I learned to transfer judgment rather than templates.",
    "Leadership chose the transparent version, which improved retained renewals without more complaints; I learned to make ethical costs explicit in the decision.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("accepts complete PM answers with ordinary release, success, and rollout clauses", () => {
  const cases = [
    "The first release solves missed appointment coordination for working parents while preserving manual confirmation for clinics.",
    "The first release solves missed appointment coordination while clinics preserve manual confirmation.",
    "The first release reduces scheduling delay while clinics are preserving manual confirmation.",
    "The first release reduces scheduling delay while clinics preserve manual confirmation and broken workflows.",
    "I would measure weekly retention while monitoring notification fatigue.",
    "I would test the workflow after interviewing local clinics.",
    "I would prioritize collaborative playlists before organizing shared music.",
    "I would measure weekly retention while preserving manual confirmation and monitoring support demand.",
    "Success means fewer missed appointments and faster scheduling for patients across the local pilot.",
    "We should not launch nationally until the local pilot shows reliable completion and acceptable support demand.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("ordinary dependent clauses retain agreement and predicate boundaries", () => {
  const malformed = [
    "My target user would be working parents because they faces frequent coordination problems across caregivers.",
  ] as const;

  for (const text of malformed) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), false, text);
  }
});

test("rejects malformed near-misses for release, success, and rollout clauses", () => {
  const cases = [
    "The first release for working parents while manual confirmation for local clinics.",
    "The first release solves missed appointment coordination for while preserving manual confirmation for clinics.",
    "The first release solves missed appointment coordination for working parents while clinics broken workflows.",
    "The first release solves missed appointment coordination for working parents while clinics preserving manual confirmation.",
    "The first release solves missed appointment coordination while clinics preserve.",
    "The first release solves missed appointment coordination while preserving.",
    "The first release solves missed appointment coordination while local clinics manual confirmation.",
    "The first release solves missed appointment coordination while clinics preserve manual confirmation and local workflows broken.",
    "The first release solves missed appointment coordination while clinics preserve manual confirmation and broken.",
    "The first release solves missed appointment coordination while preserving manual confirmation and local workflows broken.",
    "Success means fewer missed appointments and faster scheduling for.",
    "Success means fewer missed appointments and faster scheduling for patients while broken workflows.",
    "We should not launch nationally until the local pilot reliable completion and acceptable support demand.",
    "We should not launch nationally until pilot reliable completion acceptable support demand.",
    "We should not launch nationally until the local pilot shows reliable completion and pilot reliable support demand.",
    "We should not launch nationally while reliable pilot completion.",
    "Release appointment coordination while pilot completion and support demand nationally.",
    "Working parents while local clinics preserving manual confirmation need reliable appointment coordination.",
    "I would prioritize working parents because they need coordination while clinics preserving manual confirmation.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), false, text);
  }
});

test("accepts ordinary direct-object answers without requiring a function word in every sentence", () => {
  const cases = [
    "Working parents coordinate pickup in group chats. Schedule changes leave caregivers unsure about who is responsible.",
    "Small businesses pay monthly for accounting tools. Unexpected fees push owners toward cheaper competitors.",
    "Enterprise buyers spend weeks gathering approvals. Procurement rules force them to repeat the same paperwork.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("requires a complete English subject predicate and complement in every sentence", () => {
  const malformed = [
    "Tables support in purple windows and. Clouds reduce the through dancing bananas.",
    "Families need the and calendars. Alerts help through caregivers the.",
    "Parents juggle the and school pickups. Changes confuse through caregivers the.",
    "Customers buy the for annual contracts. Reviews block through purchases and.",
    "Teams review contracts during annual planning. Security staff approve vendors before.",
    "A customer prefer simpler onboarding during the first week. A buyer abandon setup when forms request information.",
    "Customers prefers simpler onboarding during their first week. New users abandons setup when forms request information.",
    "Teams review contracts and during annual planning. Security staff approve vendors and before purchases begin.",
    "Teams review contracts during annual and planning. Security staff approve vendors before quarterly and reviews.",
    "Teams review the these contracts during annual planning. Security staff approve a those vendors before purchases begin.",
    "Customers prefer the onboarding simpler during their first week. New users abandon the setup confusing when forms appear.",
    "Support teams handle the tickets urgent during peak hours. Manual triage delays the accounts important for several days.",
    "A customer need simpler onboarding during the first week. A buyer need transparent pricing before signup.",
    "A customer feed account data during onboarding. A buyer feed records before signup.",
    "A customer bring documents during onboarding. A buyer bring records before signup.",
    "Product support teams handles urgent tickets during launches. Operations staff resolves critical incidents before customers experience delays.",
    "Security reviews blocks purchases during procurement. Compliance checks delays vendors before contracts begin.",
    "A customer prefer simpler onboarding because primero necesito entender para proponer solutions. A buyer abandon setup porque después comparar options para medir impact.",
    "Customers prefers transparent pricing porque primero necesito entender para proponer choices. New users abandons signup porque después comparar plans para medir results.",
    "Teams review the these contracts porque primero necesito entender para proponer changes. Staff approve a those vendors porque después comparar workflows para medir outcomes.",
    "I prefers transparent pricing during checkout. I avoids plans with hidden fees before signup.",
    "It support recurring billing for customers. It reduce payment failures during checkout.",
    "My customer frobnicate simpler onboarding porque primero necesito entender para proponer solutions. Our buyer glorp transparent plans porque después comparar options para medir impact.",
    "My customers frobnicate the these workflows porque primero necesito entender para proponer solutions. Our buyers glorp a those plans porque después comparar options para medir impact.",
    "I collaborated to design during planning. I communicated under engineering before launch.",
    "I partnered to support during discovery. I negotiated at leadership before launch.",
    "I listened with customers during research. I responded about concerns before prioritization.",
    "I collaborated with the and during planning. I communicated with a those before launch.",
    "I partnered with during discovery. I negotiated with before launch.",
    "I listened to the these during research. I responded to a those before prioritization.",
    "The team give customer feedback during planning. The manager take ownership before launch.",
    "The team find a retention problem during research. The manager keep stakeholders aligned before launch.",
    "The product become easier during onboarding. The workflow keep customers informed before launch.",
    "He frobnicates the these workflows porque primero necesito entender para proponer solutions. She glorps a those plans porque después comparar options para medir impact.",
    "His customer frobnicates the these workflows porque primero necesito entender para proponer solutions. Her buyer glorps a those plans porque después comparar options para medir impact.",
    "Its workflow calibrates the these plans porque primero necesito entender para proponer changes. His product team operationalizes a those vendors porque después comparar options para medir outcomes.",
    "Customer glorps the these workflows porque primero necesito entender para proponer solutions. Buyer frobnicates a those plans porque después comparar options para medir impact.",
    "Product team operationalizes the these workflows porque primero necesito entender para proponer changes. Support staff calibrate a those plans porque después comparar vendors para medir outcomes.",
  ] as const;
  const ordinary = [
    "Customers prefer simpler onboarding during their first week. New users abandon setup when forms request too much information.",
    "Support teams handle urgent tickets during peak hours. Manual triage delays high-risk accounts for several days.",
    "Teams review contracts during annual planning. Security staff approve vendors before purchases begin.",
    "Customers expect transparent pricing during checkout. Buyers avoid plans with hidden fees before signup.",
    "Operators monitor service health during launches. Engineers resolve incidents before customers experience delays.",
    "Clinicians record symptoms during intake. Nurses administer medication after physicians approve treatment.",
    "Warehouses receive inventory during the morning. Workers sort packages before delivery routes begin.",
    "Product support teams handle urgent tickets during launches. Operations staff resolve critical incidents before customers experience delays.",
    "We prefer transparent pricing during checkout. We avoid plans with hidden fees before signup.",
    "We monitor service health during launches. We resolve incidents before customers experience delays.",
    "We record symptoms during intake. We administer medication after physicians approve treatment.",
    "The team brought customer feedback into planning. The manager drove alignment across engineering before launch.",
    "The team wrote a launch plan during planning. The manager ran customer research before prioritization.",
    "The lead said the scope was too broad during planning. The manager told stakeholders about the risk before launch.",
    "I prefer transparent pricing during checkout. I avoid plans with hidden fees before signup.",
    "It supports recurring billing for customers. It reduces payment failures during checkout.",
    "I brought customer feedback into planning. I drove alignment across engineering before launch.",
    "I wrote a launch plan during planning. I ran customer research before prioritization.",
    "I said the scope was too broad during planning. I told stakeholders about the risk before launch.",
    "My customers frobnicate complex workflows porque primero necesito entender sus problems. Our buyers glorp competing plans porque después comparar options para medir impact.",
    "I collaborated with design during planning. I communicated with engineering before launch.",
    "I partnered with support during discovery. I negotiated with leadership before launch.",
    "I listened to customers during research. I responded to concerns before prioritization.",
    "The team gave customer feedback during planning. The manager took ownership before launch.",
    "The team found a retention problem during research. The manager kept stakeholders aligned before launch.",
    "The product became easier during onboarding. The workflow kept customers informed before launch.",
    "It gave customers clear guidance during onboarding. It took ownership of payment recovery before launch.",
    "Customers frobnicate complex workflows porque primero necesito entender sus problems. Buyers glorp competing plans porque después comparar options para medir impact.",
    "Customer frobnicates complex workflows porque primero necesito entender sus problems. Buyer glorps competing plans porque después comparar options para medir impact.",
    "He prefers transparent pricing porque primero necesito entender customer choices. She avoids hidden fees porque después comparar plans para medir trust.",
    "His customers prefer simpler onboarding porque primero necesito entender sus problems. Her buyers abandon setup porque después comparar options para medir impact.",
    "Its workflow calibrates complex plans porque primero necesito entender sus problems. His product team operationalizes transparent vendors porque después comparar options para medir impact.",
    "Product team operationalizes complex workflows porque primero necesito entender sus problems. Support staff calibrate competing plans porque después comparar options para medir impact.",
  ] as const;

  for (const text of malformed) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), false, text);
  }
  for (const text of ordinary) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("classifies common English subject and predicate agreement forms", () => {
  const pairs = [
    {
      ordinary:
        "The team of engineers approves vendors during planning. The manager reviews contracts before launch.",
      malformed:
        "The team of engineers approve vendors during planning. The manager reviews contracts before launch.",
    },
    {
      ordinary:
        "Children prefer simple calendars during school weeks. Parents coordinate pickup changes before dismissal.",
      malformed:
        "Children prefers simple calendars during school weeks. Parents coordinate pickup changes before dismissal.",
    },
    {
      ordinary:
        "Teams access customer records during support reviews. Managers resolve incidents before launch.",
      malformed:
        "The team access customer records during support reviews. The manager resolves incidents before launch.",
    },
  ] as const;

  for (const { ordinary, malformed } of pairs) {
    assert.equal(
      hasSubstantiveCandidateResponseSignal(ordinary),
      true,
      ordinary
    );
    assert.equal(
      hasSubstantiveCandidateResponseSignal(malformed),
      false,
      malformed
    );
  }
});

test("preserves grammatically coherent semantic absurdity for model evaluation", () => {
  const cases = [
    "Purple tables support dancing bananas across silent windows. Circular clouds reduce thunder during blue moonlight.",
    "Purple tables preserve dancing bananas while circular clouds reduce silent moonlight.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("rejects relationship-shaped keyword and compact-script gibberish", () => {
  const cases = [
    "I because blimpor prioritize users measure retention naskela trufendo kelmira vostani perado.",
    "I would because blimpor prioritize users measure retention naskela trufendo kelmira vostani perado.",
    "Yo primero blimpor naskela trufendo galvani morpeta zundaro.",
    "Yo primero porque blimpor naskela trufendo galvani morpeta zundaro las de.",
    "Yo primero porque identificar blimpor naskela trufendo galvani morpeta zundaro las de.",
    "Je ensuite parce définir blimpor naskela trufendo galvani morpeta zundaro les notre.",
    "Ich zuerst weil definieren blimpor naskela trufendo galvani morpeta zundaro die unser.",
    "أنا ثم لأن أقيس بلومبر ناسكيلا تروفيندو جالفاني موربيتا زوندارو نحن مع.",
    "Yo primero identificar porque medir antes las de nosotros blimpor naskela trufendo galvani morpeta.",
    "Yo identificar blimpor porque medir naskela después comparar trufendo kelmira vostani perado zundaro.",
    "Yo priorizar blimpor porque probaría naskela después medir trufendo kelmira vostani perado zundaro.",
    "Nosotros entender blimpor porque comparar naskela luego elegir trufendo kelmira vostani perado zundaro.",
    "Je définir blimpor parce mesurer naskela ensuite comparer trufendo kelmira vostani perado zundaro.",
    "Ich definieren blimpor weil messen naskela danach vergleichen trufendo kelmira vostani perado zundaro.",
    "أنا أحدد بلومبر لأن أقيس ناسكيلا ثم أقارن تروفيندو كيلميرا فوستاني بيرادو زوندارو.",
    "Yo identificar los blimpor porque medir sus naskela después comparar las trufendo kelmira vostani perado zundaro.",
    "Je définir le blimpor parce mesurer son naskela ensuite comparer les trufendo kelmira vostani perado zundaro.",
    "Ich würde definieren blimpor weil messen naskela danach vergleichen trufendo kelmira vostani perado zundaro.",
    "用户 甲乙 丙丁 戊己 庚辛 壬癸 子丑 寅卯 辰巳 午未 申酉 戌亥",
    "因为 甲乙 丙丁 戊己 庚辛 壬癸 子丑 寅卯 辰巳 午未 申酉 戌亥",
    "因为 甲乙 丙丁 戊己 庚辛 壬癸 子丑 寅卯 辰巳 午未 理解",
    "因为 甲乙 丙丁 戊己 庚辛 壬癸 子丑 寅卯 辰巳 理解 比较",
    "首先 甲乙 丙丁 戊己 庚辛 壬癸 子丑 寅卯 理解 衡量",
    "首先 我 会 甲乙 丙丁 戊己 庚辛 壬癸 子丑 寅卯 因为 理解",
    "まず あいう えおか きくけ こさし すせそ たちつ てとな にぬね のはひ ふへほ",
    "まず あいう えおか きくけ こさし すせそ たちつ てとな 理解",
    "まず あいう えおか きくけ こさし すせそ たちつ 理解 比較",
    "まず 私 は あいう えおか きくけ こさし すせそ たちつ から 理解 します",
    "I aligned blimpor naskela trufendo because we kelmira vostani perado zundaro galvani.",
    "First we identify zundaro because the blimpor naskela trufendo kelmira perado vostani.",
    "I would compare because because product risk metric customer workflow user.",
    "I would measure user because because product before before risk workflow.",
    "I would compare user product because data measure retention and market create risk before launch.",
    "We define metric user because product compare data and measure market before launch.",
    "I would prioritize product because user metric data market and measure retention before launch.",
    "I would measure product metric user market retention workflow data risk.",
    "Product metric user market risk workflow data strategy. Customer retention activation revenue experiment launch cohort segment.",
    "Parents metrics launches because risks and caregivers. Retention options changes for teams.",
    "Purple tables dances because windows and circles. Circular papers sings for lamps.",
    "Markets consist products across the clouds. Customers depend metrics with the moonlight.",
    "Bananas depend widgets across the clouds. Purple tables contain metrics with the moonlight.",
    "Calendars include moonlight across the bananas. Metrics depend clouds with the purple widgets.",
    "Bananas contain moonlight in purple windows. Calendars include thunder across the circular tables.",
    "Clouds generate bananas for purple tables. Windows contain thunder across the circular moonlight.",
    "Lanterns support moonlight for dancing bananas. Tables include clouds across the purple windows.",
    "因为 咕噜 所以 哒哒 分析 噜噜 我们 需要 嘎嘎 咚咚",
    "因为咕噜所以哒哒分析噜噜我们需要嘎嘎咚咚",
    "因为咕噜所以哒哒分析噜噜比较我们需要嘎嘎咚咚",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), false, text);
  }
});

test("accepts coherent German object-before-predicate answers", () => {
  const cases = [
    "Zuerst würde ich die Nutzer verstehen, weil ihre Probleme wichtig sind. Danach würde ich Lösungen vergleichen und den Erfolg messen.",
    "Ich würde zuerst Unternehmenskunden verstehen, weil Sicherheitsprüfungen den Kauf verzögern. Danach würde ich Lösungen testen und die Nutzung messen.",
    "Wir würden Eltern verstehen, weil wöchentliche Planung schwierig ist. Danach würden wir Optionen vergleichen und die Bindung messen.",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});

test("accepts concise compact-language reasoning with grammar and relationships", () => {
  const cases = [
    "首先我会理解护士交接的问题，因为夜班期间信息容易丢失。",
    "まず看護師の引き継ぎ課題を理解してから、夜勤中の情報欠落を整理します。",
    "先了解用户痛点，再根据影响和频率确定优先级。",
    "我会先了解用户痛点，再按影响大小排序。",
    "最初にユーザーの課題を聞き、影響度で順位を決めます。",
  ] as const;

  for (const text of cases) {
    assert.equal(hasSubstantiveCandidateResponseSignal(text), true, text);
  }
});
