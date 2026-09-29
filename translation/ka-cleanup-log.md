# Georgian catalog cleanup — translator review

155 values changed in `src/messages/ka/*.json`, mirrored in the `ka` field of `translation/*.json`. Terms follow `src/messages/GLOSSARY.md`. Rows marked TRANSLATOR want a second look.

| key | before | after | reason |
| --- | --- | --- | --- |
| `admin.adminChangePasswordForm.yourBackOfficeAccountWasCreated` | თქვენი ადმინისტრაციული (back-office) ანგარიში შეიქმნა დროებითი პაროლით. გაგრძელებისთვის აირჩიეთ ახალი პაროლი | თქვენი ადმინისტრაციული ანგარიში შეიქმნა დროებითი პაროლით. გაგრძელებისთვის აირჩიეთ ახალი პაროლი. | Removed English gloss (back-office); added final period to match English |
| `admin.adminContentHomePage.noSectionsForThisLocaleYet` | მ ლოკალისთვის სექციები ჯერ არ არის — სადესანტო გვერდი (landing page) აჩვენებს თავის ნაგულისხმევ სტრუქტურას. | ამ ლოკალისთვის სექციები ჯერ არ არის — მთავარი გვერდი აჩვენებს თავის ნაგულისხმევ სტრუქტურას. | Removed gloss (landing page); fixed truncated first word მ → ამ; სადესანტო (military 'landing') → მთავარი გვერდი per glossary |
| `admin.adminContentHomePage.theSectionsOfThePublicLanding` | საჯარო გვერდის სექციები მათი გამოჩენის თანმიმდევრობით. თუ კონკრეტული ლოკალისთვის სექციები არ არის, გვერდი უბრუნდება ჩაშენებულ ნაგულისხმევ სტრუქტურას. ნავიგაციის ზოლი და ფუტერი (footer) გვერდის მუდმივი ელემენტებია (page chrome): ისინი ყოველთვის ჩნდებიან ზემოთ და ქვემოთ, მიუხედავად ამ სიასში მათი პოზიციისა, ამიტომ მათი გადაადგილება არაფერს ცვლის. | საჯარო მთავარი გვერდის სექციები მათი გამოჩენის თანმიმდევრობით. თუ კონკრეტული ლოკალისთვის სექციები არ არის, გვერდი უბრუნდება ჩაშენებულ ნაგულისხმევ სტრუქტურას. ნავიგაციის ზოლი და ფუტერი გვერდის მუდმივი ელემენტებია: ისინი ყოველთვის ჩნდებიან ზემოთ და ქვემოთ, მიუხედავად ამ სიაში მათი პოზიციისა, ამიტომ მათი გადაადგილება არაფერს ცვლის. | Removed glosses (footer), (page chrome); typo სიასში → სიაში |
| `admin.adminDriversApplications.docs` | დოკუმენტაცია (Docs) | დოკუმენტები | Removed gloss (Docs); Document = დოკუმენტი per glossary |
| `admin.adminShell.backOffice` | ბექ-ოფისი (Back Office) | ბექ-ოფისი | Removed gloss (Back Office) |
| `admin.dateRangePicker.apply` | გამოყენება / დადასტურება | გამოყენება | Chose one alternative |
| `admin.homePageContent.canACompanyBookAndDispatch` | შეუძლია თუ არა კომპანიას დაჯავშნა და გადანაწილება (dispatch) როგორც ბიზნესს? | შეუძლია თუ არა კომპანიას დაჯავშნა და დანიშვნა, როგორც იურიდიულ პირს? | Removed gloss (dispatch); Dispatch = დანიშვნა, Business = იურიდიული პირი per glossary |
| `admin.homePageContent.closingCta` | საბოლოო CTA (Call to Action) | დასკვნითი მოწოდება | Removed gloss (Call to Action); aligned with homePageSectionTypes.closingCta (same English) |
| `admin.homePageContent.cookies` | ქუქი-ფაილები (Cookies) | ქუქი-ფაილები | Removed gloss (Cookies) |
| `admin.homePageContent.faq` | ხშირად დასმული კითხვები (FAQ) | ხშირად დასმული კითხვები | Removed gloss (FAQ) |
| `admin.homePageContent.intercity` | ქალაქთაშორისი (Intercity) | ქალაქთაშორისი | Removed gloss (Intercity) |
| `admin.homePageContent.knowTheFareBeforeYouCommit` | იcodeთ ტარიფი სანამ დაადასტურებთ. | იცოდეთ ღირებულება, სანამ დაადასტურებთ. | Latin typo იcodeთ → იცოდეთ; Fare = ღირებულება per glossary; comma before სანამ |
| `admin.homePageContent.liveTracking` | თვალყურის დევნება რეალურ დროში (Live tracking) | თვალყურის დევნება რეალურ დროში | Removed gloss (Live tracking) |
| `admin.homePageSectionFormDialog.aside` | გვერდითი ბლოკი / Aside | გვერდითი ბლოკი | Chose Georgian alternative, dropped English |
| `admin.homePageSectionFormDialog.bothFieldsAreFreeTextAnd` | ორივე ველი თავისუფალი ტექსტია და მხოლოდ სარედაქციო ხასიათისაა. სახელი არ არის დაკავშირებული ქალაქების სიასთან, რომელსაც ჯავშნის ნაკადი использует, და სისტემაში არ არსებობს მომსახურების დონის (tier) მონაცემები — დონე არის ის, რასაც აქ ჩაწერს ადამიანი, ვინც იცის რეალური პასუხი. | ორივე ველი თავისუფალი ტექსტია და მხოლოდ სარედაქციო ხასიათისაა. სახელი არ არის დაკავშირებული ქალაქების სიასთან, რომელსაც ჯავშნის ნაკადი იყენებს, და სისტემაში არსად არ არსებობს მომსახურების დონის მონაცემები — დონე არის ის, რასაც აქ ჩაწერს ადამიანი, ვინც იცის რეალური პასუხი. | Russian word использует → იყენებს; removed gloss (tier); added არსად for 'anywhere' |
| `admin.homePageSectionFormDialog.buttonLabel` | ღილაკის ტექსტი (Label) | ღილაკის ტექსტი | Removed gloss (Label) |
| `admin.homePageSectionFormDialog.eachNewLineIsRenderedAs` | თითოეული ახალი სტრიქონი აისახება სათაურის ახალ აბზაცად (line break). | თითოეული ახალი სტრიქონი სათაურში ხაზის გადატანად აისახება. | Removed gloss (line break); 'line break' is ხაზის გადატანა, not a new paragraph |
| `admin.homePageSectionFormDialog.eyebrow` | ზედა სათაური / Eyebrow | ზედა სათაური | Chose Georgian alternative, dropped English |
| `admin.homePageSectionFormDialog.fallbackCaption` | სარეზერვო წარწერა (Fallback caption) | სარეზერვო წარწერა | Removed gloss (Fallback caption) |
| `admin.homePageSectionFormDialog.fromLabel` | საიდან ტექსტი (From label) | „საიდან“ ტექსტი | Removed gloss (From label); quoted the field name, Label = ტექსტი as in sibling keys |
| `admin.homePageSectionFormDialog.heading` | სათაური (Heading) | სათაური | Removed gloss (Heading) |
| `admin.homePageSectionFormDialog.headline` | მთავარი სათაური (Headline) | მთავარი სათაური | Removed gloss (Headline) |
| `admin.homePageSectionFormDialog.intro` | შესავალი (Intro) | შესავალი | Removed gloss (Intro) |
| `admin.homePageSectionFormDialog.label` | ტექსტი / Label | ტექსტი | Chose Georgian alternative (Label = ტექსტი as in sibling keys) |
| `admin.homePageSectionFormDialog.orderLabel` | შეკვეთის ტექსტი (Label) | შეკვეთის ტექსტი | Removed gloss (Label) |
| `admin.homePageSectionFormDialog.statusChipTag` | სტატუსის ჭდის თეგი (Status chip tag) | სტატუსის ჭდის თეგი | Removed gloss (Status chip tag) |
| `admin.homePageSectionFormDialog.theFiguresBelowTheHeroAre` | მთავარი ბანერის (hero) ქვემოთ მოცემული ციფრები არის სტატისტიკის მწკრივი, რომელიც ცალკე სექციაა. ძველ სათაურს აქ ველი არ აქვს, ამიტომ განახლებულ დიზაინამდე შექმნილი ტექსტი უქმდება. | მთავარი ბანერის ქვემოთ მოცემული ციფრები არის სტატისტიკის მწკრივი, რომელიც ცალკე სექციაა. ძველ სათაურს აქ ველი არ აქვს, ამიტომ განახლებულ დიზაინამდე შექმნილი ტექსტი უქმდება. | Removed gloss (hero) |
| `admin.homePageSectionFormDialog.theMockOrderPinnedToThe` | დიდ ბარათზე მიმაგრებული სანიმუშო შეკვეთა არის ილუსტრაცია და არა რეალური მონაცემი — სწორედ ამიტომ არის ის აქ გაწერილი და არ არის კოდში ხისტად ჩასმული (hardcoded). | დიდ ბარათზე მიმაგრებული სანიმუშო შეკვეთა არის ილუსტრაცია და არა რეალური მონაცემი — სწორედ ამიტომ არის ის აქ გაწერილი და არ არის კოდში ხისტად ჩასმული. | Removed gloss (hardcoded) |
| `admin.homePageSectionFormDialog.theTilesThemselvesAreGeneratedFrom` | თვითონ ფილები (tiles) გენერირდება ტვირთის ტაქსონომიიდან და მისი ფასწარმოქმნის წესებიდან. | თვითონ ფილები გენერირდება ტვირთის ტაქსონომიიდან და მისი ფასწარმოქმნის წესებიდან. | Removed gloss (tiles) |
| `admin.homePageSectionFormDialog.tier` | დონე / Tier | დონე | Chose Georgian alternative, dropped English |
| `admin.homePageSectionFormDialog.tiles` | ფილები (Tiles) | ფილები | Removed gloss (Tiles) |
| `admin.homePageSectionFormDialog.toLabel` | ტექსტი / To label | „სადამდე“ ტექსტი | Chose Georgian; the original ტექსტი alone lost the 'To' meaning |
| `admin.homePageSectionFormDialog.wordmark` | ლოგოტიპი / Wordmark | ლოგოტიპი | Chose Georgian alternative, dropped English |
| `admin.homePageSectionTypes.closingCta` | დასკვნითი მოწოდება (CTA) | დასკვნითი მოწოდება | Removed gloss (CTA) |
| `admin.homePageSectionTypes.driverCta` | მოწოდება მძღოლებისთვის (CTA) | მოწოდება მძღოლებისთვის | Removed gloss (CTA) |
| `admin.messagingTemplateFormDialog.aSubjectIsRequiredForEmail` | ელფოსტის შაბლონებისთვის აუცილებელია თემის (Subject) მითითება. | ელფოსტის შაბლონებისთვის აუცილებელია თემის მითითება. | Removed gloss (Subject) |
| `auth.auth.accountsCannotBeCreatedFromThe` | ადმინისტრაციული ჰოსტიდან (admin host) ანგარიშების შექმნა შეუძლებელია. | ადმინისტრაციული ჰოსტიდან ანგარიშების შექმნა შეუძლებელია. | Removed gloss (admin host) |
| `common.shared.aTemplateWithThatKeyAlready` | ამ გასაღებით (key) შაბლონი უკვე არსებობს ამ არხისა და ლოკალისთვის. | ამ გასაღებით შაბლონი უკვე არსებობს ამ არხისა და ლოკალისთვის. | Removed gloss (key) |
| `common.shared.acceptance` | დადასტურება / მიღება | მიღება | Chose one alternative; Accept = მიღება per glossary (driver acceptance metric) |
| `common.shared.dashboard` | მართვის პანელი (Dashboard) | მართვის პანელი | Removed gloss (Dashboard) |
| `common.shared.eventKey` | მოვლენის გასაღები (Event key) | მოვლენის გასაღები | Removed gloss (Event key) |
| `common.shared.fillInTheWizardBeforeSubmitting` | განაცხადის გაგზავნამდე შეავსეთ ოსტატის (wizard) ველები. | განაცხადის გაგზავნამდე შეავსეთ ფორმის ყველა ნაბიჯი. | Removed gloss (wizard); ოსტატი (craftsman) replaced with 'every step of the form' |
| `common.shared.flag` | დროშა / მონიშვნა | მონიშვნა | Chose one alternative; Flag = მონიშვნა per glossary (დროშა is a literal flag) |
| `common.shared.idNumber` | პირადი ნომერი / ID | პირადი ნომერი | Chose Georgian alternative |
| `common.shared.incentives` | წახალისებები / ბონუსები | ბონუსები | Chose one alternative (consistent with weeklyIncentive) |
| `common.shared.isactiveMustBeABoolean` | isActive უნდა იყოს ლოგიკური ტიპი (boolean). | isActive უნდა იყოს ლოგიკური ტიპი. | Removed gloss (boolean); field name kept as code |
| `common.shared.jobs` | შეკვეთები / სამუშაოები | რეისები | Job = რეისი per glossary (neither offered alternative was the glossary term) |
| `common.shared.key` | გასაღები (Key) | გასაღები | Removed gloss (Key) |
| `common.shared.load` | ტვირთი / დატვირთვა | გადაზიდვა | Load = გადაზიდვა per glossary (neither offered alternative was the glossary term) |
| `common.shared.namespace` | სახელთა სივრცე (Namespace) | სახელთა სივრცე | Removed gloss (Namespace) |
| `common.shared.onlyLogisticsCompaniesCanDispatchDeliveries` | შეკვეთების გადანაწილება (dispatch) მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | შეკვეთების დანიშვნა მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Removed gloss (dispatch); Dispatch = დანიშვნა, ლოგისტიკური → ლოჯისტიკური per glossary |
| `common.shared.payoutAccount` | თანხის გასატანი (payout) ანგარიში | ანაზღაურების ანგარიში | Removed gloss (payout); Payout = ანაზღაურება per glossary |
| `common.shared.placement` | განთავსება / პოზიცია | განთავსება | Chose one alternative |
| `common.shared.promise` | დაპირება / გარანტია | დაპირება | Chose one alternative |
| `common.shared.sample` | ნიმუში / Sample | ნიმუში | Chose Georgian alternative |
| `common.shared.scope` | მოქმედების სფერო / Scope | მოქმედების სფერო | Chose Georgian alternative |
| `common.shared.subject` | თემა / Subject | თემა | Chose Georgian alternative |
| `common.shared.unassigned` | უმისამართო / მიუნიჭებელი | მიუმაგრებელი | Assign = მიმაგრება per glossary (neither offered alternative was the glossary term) |
| `common.shared.unauthorized` | ავტორიზაცია არ არის გავლილი (Unauthorized). | ავტორიზაცია არ არის გავლილი. | Removed gloss (Unauthorized) |
| `common.shared.vehicles` | ტრანსპორტი (მრავლობითი) | ავტომობილები | Removed translator note (მრავლობითი = 'plural'); Vehicle = ავტომობილი per glossary |
| `dashboard.sample.acceptanceRate` | შეკვეთების მიღების მაჩვენებელი (Acceptance rate) | შეკვეთების მიღების მაჩვენებელი | Removed gloss (Acceptance rate) |
| `dashboard.sample.garage` | გარაჟი / სერვისი | გარაჟი | Chose the alternative matching the English |
| `dashboard.sample.idleTime` | უქმად დგომის დრო (Idle time) | უქმად დგომის დრო | Removed gloss (Idle time) |
| `dashboard.sample.payoutAccounts` | გასატანი ანგარიშები (Payout accounts) | ანაზღაურების ანგარიშები | Removed gloss (Payout accounts); Payout = ანაზღაურება per glossary |
| `dashboard.sample.taxId` | საიდენტიფიკაციო / საგადასახადო კოდი | საიდენტიფიკაციო კოდი | Chose one alternative (Georgian tax ID is the საიდენტიფიკაციო კოდი) |
| `driverHub.driverHubSidebar.weeklyIncentive` | ყოველკვირეული ბონუსი / წახალისება | ყოველკვირეული ბონუსი | Chose one alternative (consistent with shared.incentives) |
| `driverHub.driversAddPanel.rigidTrucks` | ძარიანი / მძიმე სატვირთოები | ძარიანი სატვირთოები | Merged alternatives; 'rigid' is not 'heavy' |
| `driverHub.driversDetailPanel.verification` | ვერიფიკაცია / გადამოწმება | ვერიფიკაცია | Chose one alternative (matches glossary ვერიფიცირებული) |
| `driverHub.earningsBreakdownCard.tips` | ჩაი / ჩაის ფული (Tips) | ჩაის ფული | Chose one alternative; removed gloss (Tips) |
| `driverHub.earningsFilterBar.custom` | სხვა / მორგებული | მორგებული | Chose one alternative (custom date range) |
| `driverHub.earningsPayoutsCard.amount` | თანხა / რაოდენობა | თანხა | Chose one alternative (money amount) |
| `driverHub.employeesScreen.person` | პირი / პიროვნება | პირი | Chose one alternative |
| `driverHub.fleetAvailabilityDialogs.discard` | გაუქმება / უარყოფა | გაუქმება | Chose one alternative (dialog dismiss button beside 'Hold slot') |
| `driverHub.fleetAvailabilityFilters.capacity` | ტვირთამწეობა / ტევადობა | ტვირთამწეობა | Chose one alternative (vehicle load capacity) |
| `driverHub.fleetAvailabilityFilters.zoom` | მასშტაბირება (Zoom) | მასშტაბირება | Removed gloss (Zoom) |
| `driverHub.hubJobParts.payout` | გადარიცხვა / payout | ანაზღაურება | Payout = ანაზღაურება per glossary; dropped English alternative |
| `driverHub.jobSheetParts.awaitingDispatch` | ელოდება გადანაწილებას (dispatch) | ელოდება დანიშვნას | Removed gloss (dispatch); Dispatch = დანიშვნა per glossary |
| `driverHub.jobSheetParts.deadline` | ბოლო ვადა (Deadline) | ბოლო ვადა | Removed gloss (Deadline) |
| `driverHub.jobSheetParts.inTransit` | ტრანზიტშია / გზაშია | გზაში | In transit = გზაში per glossary |
| `driverHub.jobSheetParts.timeline` | ქრონოლოგია (Timeline) | ქრონოლოგია | Removed gloss (Timeline) |
| `driverHub.jobSheetParts.timing` | დრო / ტაიმინგი | დრო | Chose Georgian alternative |
| `driverHub.jobsScreen.fare` | ტარიფი / მგზავრობის საფასური | ღირებულება | Fare = ღირებულება per glossary |
| `driverHub.jobsScreen.job` | შეკვეთა / სამუშაო | რეისი | Job = რეისი per glossary (neither offered alternative was the glossary term) |
| `driverHub.loadsClaimDialogs.firstComeFirstServedConfirmingClaims` | პირველი მომსვლელის პრინციპით (First come, first served). დადასტურება იღებს შეკვეთას და ხურავს მას სხვა მძღოლებისთვის. | პირველი მომსვლელის პრინციპით. დადასტურება იღებს შეკვეთას და ხურავს მას სხვა მძღოლებისთვის. | Removed gloss (First come, first served) |
| `driverHub.loadsFilters.reset` | განახლება / ჩამოყრა | ჩამოყრა | Chose one alternative (reset filters; განახლება means refresh) |
| `driverHub.loadsFormat.hazmat` | სახიფათო ტვირთი (Hazmat) | საშიში ტვირთი | Removed gloss (Hazmat); Hazmat = საშიში ტვირთი per glossary |
| `driverHub.loadsFormat.timeCritical` | დროში შეზღუდული / სასწრაფო | სასწრაფო | Time critical = სასწრაფო per glossary |
| `driverHub.loadsMobile.restoreToBoard` | დაფაზე დაბრუნება / აღდგენა | დაფაზე დაბრუნება | Chose the alternative matching the English |
| `driverHub.performanceScreen.estimatedDelta` | სავარაუდო სხვაობა (delta) | სავარაუდო სხვაობა | Removed gloss (delta) |
| `driverHub.performanceScreen.whatAffectsYourScore` | რა მოქმედებს თქვენს ქულაზე / რეიტინგზე | რა მოქმედებს თქვენს ქულაზე | Chose the alternative matching the English (score) |
| `driverHub.vehiclesScreen.onTheRoad` | ხაზზეა / გზაშია | გზაში | Chose one alternative; matches In transit = გზაში |
| `errors.adminContentHomePageSections.typeIsRequiredAndMustBe` | type სავალდებულოა და უნდა იყოს ტექსტური ტიპი (string). | type სავალდებულოა და უნდა იყოს ტექსტური ტიპი. | Removed English gloss (string); field name kept as code (it is code in the English too) |
| `errors.adminContentHomePageSections.typeMustBeAString` | type უნდა იყოს ტექსტური ტიპი (string). | type უნდა იყოს ტექსტური ტიპი. | Removed English gloss (string); field name kept as code (it is code in the English too) |
| `errors.adminContentMessagingTemplates.isactiveMustBeABooleanWhen` | isActive მითითებისას უნდა იყოს ლოგიკური ტიპი (boolean). | isActive მითითებისას უნდა იყოს ლოგიკური ტიპი. | Removed English gloss (boolean); field name kept as code (it is code in the English too) |
| `errors.adminContentMessagingTemplates.subjectMustBeAStringWhen` | subject მითითებისას უნდა იყოს ტექსტური ტიპი (string). | subject მითითებისას უნდა იყოს ტექსტური ტიპი. | Removed English gloss (string); field name kept as code (it is code in the English too) |
| `errors.adminFinancePaymentMethods.isenabledIsRequiredAndMustBe` | isEnabled სავალდებულოა და უნდა იყოს ლოგიკური ტიპი (boolean). | isEnabled სავალდებულოა და უნდა იყოს ლოგიკური ტიპი. | Removed English gloss (boolean); field name kept as code (it is code in the English too) |
| `errors.adminFinancePromoCampaigns.codeMustBeAString` | code უნდა იყოს ტექსტური ტიპი (string). | code უნდა იყოს ტექსტური ტიპი. | Removed English gloss (string); field name kept as code (it is code in the English too) |
| `errors.driverProfileStatus.isonlineMustBeABoolean` | isOnline უნდა იყოს ლოგიკური ტიპი (boolean). | isOnline უნდა იყოს ლოგიკური ტიპი. | Removed English gloss (boolean); field name kept as code (it is code in the English too) |
| `errors.logisticsCompanyDriversRegister.vehicleidMustBeAStringWhen` | vehicleId მითითებისას უნდა იყოს ტექსტური ტიპი (string). | vehicleId მითითებისას უნდა იყოს ტექსტური ტიპი. | Removed English gloss (string); field name kept as code (it is code in the English too) |
| `errors.orders.descriptionMustBeAStringWhen` | description მითითებისას უნდა იყოს ტექსტური ტიპი (string). | description მითითებისას უნდა იყოს ტექსტური ტიპი. | Removed English gloss (string); field name kept as code (it is code in the English too) |
| `errors.ordersComplete.thisDeliverySVehicleTypeHas` | ამ მიწოდების ტრანსპორტის ტიპს არ აქვს ფასწარმოქმნის წესი (pricing rule). | ამ მიწოდების ავტომობილის ტიპს ფასწარმოქმნის წესი არ აქვს. | Removed gloss (pricing rule); Vehicle = ავტომობილი per glossary |
| `errors.validation.ispublishedMustBeABoolean` | isPublished უნდა იყოს ლოგიკური ტიპი (boolean). | isPublished უნდა იყოს ლოგიკური ტიპი. | Removed English gloss (boolean); field name kept as code (it is code in the English too) |
| `errors.validation.slugIsRequiredAndMustBe` | slug სავალდებულოა და უნდა იყოს ტექსტური ტიპი (string). | slug სავალდებულოა და უნდა იყოს ტექსტური ტიპი. | Removed English gloss (string); field name kept as code (it is code in the English too) |
| `fleet.fleetApplicationStatusScreen.fix` | გასწორება / შეკეთება | გასწორება | Chose one alternative (შეკეთება = mechanical repair) |
| `fleet.step1CompanyDetails.asRegistered` | როგორც რეგისტრირებულია / რეგისტრაციის მიხედვით | რეგისტრაციის მიხედვით | Chose one alternative |
| `fleet.step1CompanyDetails.payouts` | გადარიცხვები (Payouts) | ანაზღაურება | Removed gloss (Payouts); Payout = ანაზღაურება per glossary (section heading) |
| `fleet.step2FleetComposition.dryBoxTruck` | მშრალი ფურგონი სატვირთო (Dry box truck) | მშრალი ფურგონი სატვირთო | Removed gloss (Dry box truck). TRANSLATOR: phrasing still reads awkwardly, please review |
| `fleet.step2FleetComposition.removeOne` | ერთის ამოღება / წაშლა | ერთის ამოღება | Chose the alternative matching the English |
| `fleet.step4DriversAssignment.removeCurrentDriver` | მიმდინარე მძღოლის ამოღება / მოხსნა | მიმდინარე მძღოლის მოხსნა | Chose one alternative (unassign a driver) |
| `home.bookingForm.flaggedToDispatchAsTimeCritical` | მონიშნულია დისპეტჩერისთვის, როგორც დროში შეზღუდული / სასწრაფო. | მონიშნულია დისპეტჩერისთვის, როგორც სასწრაფო. | Time critical = სასწრაფო per glossary |
| `home.bookingForm.pickupWindowOptional` | აყვანის ფანჯარა / ინტერვალი (არასავალდებულო) | აღების დროის ინტერვალი (არასავალდებულო) | Chose one alternative; Pickup = აღება per glossary (აყვანა is for people). '(optional)' kept, it is in the English |
| `home.bookingForm.refrigerated` | მაცივარი / რეფრიჟერატორი | მაცივარ-ფურგონი | Refrigerated = მაცივარ-ფურგონი per glossary |
| `landing.landingQuoteCalculator.estimate` | სავარაუდო ღირებულება / კალკულაცია | წინასწარი ფასი | Quote / estimate = წინასწარი ფასი per glossary |
| `onboarding.vehicleClasses.heavyFreightTruck` | მძიმე სატვირთო ავტომობილი (Heavy Freight Truck) | მძიმე სატვირთო | Removed gloss; Heavy freight truck = მძიმე სატვირთო per glossary |
| `onboarding.vehicleClasses.largeVan` | დიდი ფურგონი (Large Van) | დიდი ფურგონი | Removed gloss (Large Van) |
| `onboarding.vehicleClasses.mediumTruck` | საშუალო სატვირთო (Medium Truck) | საშუალო სატვირთო | Removed gloss (Medium Truck) |
| `onboarding.vehicleClasses.smallVan` | მცირე ფურგონი (Small Van) | მცირე ფურგონი | Removed gloss (Small Van) |
| `onboarding.vehicleClasses.trailerTruck` | სატვირთო მისაბმელით / ტრაილერი (Trailer Truck) | მისაბმელიანი სატვირთო | Trailer truck = მისაბმელიანი სატვირთო per glossary; removed alternative and gloss |
| `account.account.theDetailsADriverSeesWhen` | დეტალები, რომლებსაც მძღოლი ხედავს, როდესაც ის თქვენს შეკვეთაზე/წამოსაღებად მოდის, და მონაცემები, რომლებითაც შედიხართ სისტემაში. ტელეფონის ნომრის განახლებულ მდგომარეობაში შენარჩუნება თავიდან აგარიდებთ მიწოდების შეფერხებას | დეტალები, რომლებსაც მძღოლი ხედავს, როდესაც ის თქვენთან ტვირთის ასაღებად მოდის, და მონაცემები, რომლებითაც შედიხართ სისტემაში. ტელეფონის ნომრის განახლებულ მდგომარეობაში შენარჩუნება თავიდან აგარიდებთ მიწოდების შეფერხებას. | Sweep: slash alternative შეკვეთაზე/წამოსაღებად → one phrase ('pickup' = აღება); added final period |
| `admin.adminContentBanners.promotionalImagesOnThePublicSite` | სარეკლამო გამოსახულებები საჯარო საიტზე. თითოეული ბანერი ჩანს ერთ კონკრეტულ ადგილას და ლოკალზე (რეგიონში/ენაზე), დალაგებული სორტირების თანმიმდევრობის მიხედვით. | სარეკლამო გამოსახულებები საჯარო საიტზე. თითოეული ბანერი ჩანს ერთ კონკრეტულ ადგილას და ლოკალზე, დალაგებული სორტირების თანმიმდევრობის მიხედვით. | Sweep: removed translator note (რეგიონში/ენაზე) |
| `admin.homePageSectionFormDialog.etaLabel` | ETA ტექსტი (სავარაუდო დრო) | მისვლის სავარაუდო დროის ტექსტი | Sweep: replaced 'ETA ტექსტი (სავარაუდო დრო)' acronym + gloss with the Georgian term |
| `auth.authFlow.aPrivatePersonNoRegistrationNumber` | ფიზიკური პირი, საიდენტიფიკაციო კოდის/ნომრის გარეშე | ფიზიკური პირი, საიდენტიფიკაციო კოდის გარეშე | Sweep: slash alternative კოდის/ნომრის → one |
| `common.shared.aSubmittedApplicationCannotBeReset` | გაგზავნილი განაცხადის გაუქმება/განახლება შეუძლებელია. | გაგზავნილი განაცხადის გაუქმება შეუძლებელია. | Sweep: slash alternative გაუქმება/განახლება → one (consistent with noApplicationToReset) |
| `common.shared.noApplicationToReset` | გასაუქმებელი/აღსადგენი განაცხადი არ არის. | გასაუქმებელი განაცხადი არ არის. | Sweep: slash alternative → one |
| `driverHub.employeesScreen.canMoveMoney` | შეუძლია თანხის გადარიცხვა/გადაადგილება | შეუძლია თანხის გადარიცხვა | Sweep: slash alternative → one |
| `driverHub.fleetAvailabilityDialogs.holdSlot` | სლოტის დაჯავშნა/დაკავება | სლოტის დაკავება | Sweep: slash alternative → one (დაჯავშნა is reserved for Book per glossary) |
| `driverHub.fleetAvailabilityDialogs.holdThisSlot` | ამ სლოტის დაჯავშნა/დაკავება | ამ სლოტის დაკავება | Sweep: slash alternative → one (as holdSlot) |
| `driverHub.loadsClaimDialogs.confirmThisShipment` | ამ ტვირთის/გადაზიდვის დადასტურება | ამ გადაზიდვის დადასტურება | Sweep: slash alternative → one; Load board item = გადაზიდვა per glossary |
| `errors.orders.failedToDrawAnOrderReference` | მიმდევრობიდან შეკვეთის კოდის/ნომრის გენერირება ვერ მოხერხდა. | მიმდევრობიდან შეკვეთის ნომრის გენერირება ვერ მოხერხდა. | Sweep: slash alternative კოდის/ნომრის → one |
| `errors.ordersAccept.youReOfflineGoOnlineTo` | თქვენ ოფლაინში ხართ. ტვირთების დასაჯავშნად/მისაღებად გადადით ონლაინ რეჟიმში. | თქვენ ოფლაინში ხართ. გადაზიდვების ასაღებად გადადით ონლაინ რეჟიმში. | Sweep: slash alternative → one; Claim = აღება, Load = გადაზიდვა per glossary |
| `fleet.step2FleetComposition.refrigeratedTruck` | მაცივარი/რეფრიჟერატორი სატვირთო | მაცივარი სატვირთო | Sweep: slash alternative მაცივარი/რეფრიჟერატორი → one |
| `home.bookingForm.peopleForLoadingUnloading` | დამხმარეები დატვირთვა / დაცლისთვის | დამხმარეები დატვირთვა-გადმოტვირთვისთვის | Sweep: 'დატვირთვა / დაცლისთვის' was ungrammatical (case ending on one half only) |
| `auth.auth.driverAndLogisticsCompanyAccountsMust` | მძღოლისა და ლოგისტიკური კომპანიის ანგარიშები უნდა შეიქმნას პარტნიორის/მერჩანტის რეგისტრაციის გვერდიდან. | მძღოლისა და ლოჯისტიკური კომპანიის ანგარიშები უნდა შეიქმნას პარტნიორის რეგისტრაციის გვერდიდან. | Sweep: slash alternative პარტნიორის/მერჩანტის → one; ლოგისტიკური → ლოჯისტიკური per glossary |
| `onboarding.step2Licence.truckWithTrailerArticulated` | სატვირთო მისაბმელით / ავტოპოზდი | სატვირთო მისაბმელით / ნახევრადმისაბმელით | Sweep: ავტოპოზდი is a misspelt Russian loan (автопоезд); replaced with the Georgian for articulated (semi-trailer). Slash kept, it is in the English. TRANSLATOR: please confirm |
| `admin.homePageContent.anIndependentDriverOrALogistics` | დამოუკიდებელი მძღოლი ან ლოგისტიკური კომპანია იღებს შეკვეთას და ის აისახება თქვენს რუკაზე. ადევნეთ თვალი ტრანსპორტს დატვირთვიდან დაცლამდე და შეინახეთ თითოეული შეკვეთა თქვენს ანგარიშზე. | დამოუკიდებელი მძღოლი ან ლოჯისტიკური კომპანია იღებს შეკვეთას და ის აისახება თქვენს რუკაზე. ადევნეთ თვალი ტრანსპორტს დატვირთვიდან დაცლამდე და შეინახეთ თითოეული შეკვეთა თქვენს ანგარიშზე. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `admin.homePageContent.anOrderStartsOutPendingUntil` | შეკვეთა იწყება მოლოდინის სტატუსით, სანამ მას ტრანსპორტის პროვაიდერი არ აიღებს. ეს არის ან დამოუკიდებელი მძღოლი, რომელიც იღებს მას მის პროფილზე რეგისტრირებული ერთ-ერთი ტრანსპორტით, ან ლოგისტიკური კომპანია, რომელიც იღებს შეკვეთას და ანაწილებს მას საკუთარ სიაში მყოფ მძღოლზე. | შეკვეთა იწყება მოლოდინის სტატუსით, სანამ მას ტრანსპორტის პროვაიდერი არ აიღებს. ეს არის ან დამოუკიდებელი მძღოლი, რომელიც იღებს მას მის პროფილზე რეგისტრირებული ერთ-ერთი ტრანსპორტით, ან ლოჯისტიკური კომპანია, რომელიც იღებს შეკვეთას და ანაწილებს მას საკუთარ სიაში მყოფ მძღოლზე. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `admin.homePageContent.fleetsAndLogisticsCompanies` | ავტოპარკები და ლოგისტიკური კომპანიები | ავტოპარკები და ლოჯისტიკური კომპანიები | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `admin.homePageContent.signUpAsAnIndependentDriver` | დარეგისტრირდით როგორც დამოუკიდებელი მძღოლი ან როგორც ლოგისტიკური კომპანია, დაარეგისტრირეთ ტრანსპორტი და დაიწყეთ ტვირთების მიღება თქვენთან ახლოს მყოფი დამკვეთებისგან. | დარეგისტრირდით როგორც დამოუკიდებელი მძღოლი ან როგორც ლოჯისტიკური კომპანია, დაარეგისტრირეთ ტრანსპორტი და დაიწყეთ ტვირთების მიღება თქვენთან ახლოს მყოფი დამკვეთებისგან. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `common.shared.driverAvailabilityIsAFleetScreen` | მძღოლის ხელმისაწვდომობა არის ავტოპარკის ეკრანი — განრიგი აქვს მხოლოდ ლოგისტიკურ კომპანიას. | მძღოლის ხელმისაწვდომობა არის ავტოპარკის ეკრანი — განრიგი აქვს მხოლოდ ლოჯისტიკურ კომპანიას. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `common.shared.onlyLogisticsCompaniesHaveAFleet` | ავტოპარკის განაცხადი მხოლოდ ლოგისტიკურ კომპანიებს აქვს. | ავტოპარკის განაცხადი მხოლოდ ლოჯისტიკურ კომპანიებს აქვს. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.loads.onlyDriversAndLogisticsCompaniesCan` | ტვირთების დაფის ნახვა მხოლოდ მძღოლებსა და ლოგისტიკურ კომპანიებს შეუძლიათ. | ტვირთების დაფის ნახვა მხოლოდ მძღოლებსა და ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.loadsReject.onlyDriversAndLogisticsCompaniesCan` | ტვირთების დაფით სარგებლობა მხოლოდ მძღოლებსა და ლოგისტიკურ კომპანიებს შეუძლიათ. | ტვირთების დაფით სარგებლობა მხოლოდ მძღოლებსა და ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompany.onlyLogisticsCompaniesCanCreateA` | კომპანიის პროფილის შექმნა მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | კომპანიის პროფილის შექმნა მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompany.onlyLogisticsCompaniesHaveACompany` | კომპანიის პროფილი მხოლოდ ლოგისტიკურ კომპანიებს აქვთ. | კომპანიის პროფილი მხოლოდ ლოჯისტიკურ კომპანიებს აქვთ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyDrivers.onlyLogisticsCompaniesCanRemoveDrivers` | მძღოლების წაშლა მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | მძღოლების წაშლა მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyDrivers.onlyLogisticsCompaniesHaveADriver` | მძღოლების განრიგი მხოლოდ ლოგისტიკურ კომპანიებს აქვთ. | მძღოლების განრიგი მხოლოდ ლოჯისტიკურ კომპანიებს აქვთ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyDriversRegister.onlyLogisticsCompaniesCanRegisterDrivers` | მძღოლების რეგისტრაცია მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | მძღოლების რეგისტრაცია მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyOrdersCancel.onlyLogisticsCompaniesCanCancelDeliveries` | მიწოდების გაუქმება მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | მიწოდების გაუქმება მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyOrdersClaim.onlyLogisticsCompaniesCanClaimDeliveries` | შეკვეთების აღება მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | შეკვეთების აღება მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyVehicles.onlyLogisticsCompaniesCanAddFleet` | ავტოპარკის ტრანსპორტის დამატება მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | ავტოპარკის ტრანსპორტის დამატება მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyVehicles.onlyLogisticsCompaniesCanRemoveFleet` | ავტოპარკის ტრანსპორტის წაშლა მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | ავტოპარკის ტრანსპორტის წაშლა მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyVehicles.onlyLogisticsCompaniesHaveAFleet` | ავტოპარკი მხოლოდ ლოგისტიკურ კომპანიებს აქვთ. | ავტოპარკი მხოლოდ ლოჯისტიკურ კომპანიებს აქვთ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyVehiclesAssignment.onlyLogisticsCompaniesCanAssignVehicles` | ტრანსპორტის მინიჭება მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | ტრანსპორტის მინიჭება მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `errors.logisticsCompanyVehiclesAssignment.onlyLogisticsCompaniesCanUnassignVehicles` | ტრანსპორტის მინიჭების მოხსნა მხოლოდ ლოგისტიკურ კომპანიებს შეუძლიათ. | ტრანსპორტის მინიჭების მოხსნა მხოლოდ ლოჯისტიკურ კომპანიებს შეუძლიათ. | Glossary: ლოგისტიკური → ლოჯისტიკური |
| `fleet.fleetWizardShell.forLogisticsCompaniesRunningMoreThan` | ლოგისტიკური კომპანიებისთვის, რომლებიც ერთზე მეტ ტრანსპორტს მართავენ. დარეგისტრირეთ კომპანია ერთხელ, მიუთითეთ ავტოპარკი ძარის ტიპისა და კლასის მიხედვით, შემდეგ კი მიანიჭეთ მძღოლი თითოეულ ტრანსპორტს. | ლოჯისტიკური კომპანიებისთვის, რომლებიც ერთზე მეტ ტრანსპორტს მართავენ. დარეგისტრირეთ კომპანია ერთხელ, მიუთითეთ ავტოპარკი ძარის ტიპისა და კლასის მიხედვით, შემდეგ კი მიანიჭეთ მძღოლი თითოეულ ტრანსპორტს. | Glossary: ლოგისტიკური → ლოჯისტიკური |

## Flagged but deliberately left unchanged

| key | value | why |
| --- | --- | --- |
| `admin.adminContentMessagingTemplates.deleteTemplateDescription` | წაიშლება {channel} ტექსტი გასაღებისთვის <key>{key}</key> ({language}). თუ გსურთ, რომ აღარ გამოიყენებოდეს და ტექსტი არ დაიკარგოს, დაარედაქტირეთ და გამორთეთ „აქტიური“. | ({language}) is an ICU placeholder, not a gloss — English says 'in {language}' |
| `admin.adminContentMessagingTemplates.deleteTemplateDetail` | წაიშლება {channel} ტექსტი გასაღებისთვის <mark>{key}</mark> ({language}). თუ გსურთ, რომ აღარ გამოიყენებოდეს და ტექსტი არ დაიკარგოს, დაარედაქტირეთ და გამორთეთ „აქტიური“. | same as deleteTemplateDescription |
| `driverHub.driversScreen.subtitleOnlineIn` | ახლა ონლაინ: {count} ({cities}) | ({cities}) is an ICU placeholder, reads naturally |
