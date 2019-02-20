var START_OF_DAY = moment().hour(9).minute(0).second(0);
var IncomeCalculator = function(data) {
  var self = this;

  this.VAT = data.vat;

  this.TAX_TABLE = data.tax_table;
  this.PRIMARY_REBATE = data.primary_rebate;

  // Budget revenue streams from individuals (billions)
  // http://www.treasury.gov.za/documents/national%20budget/2017/review/FullBR.pdf (page 4)
  this.PERSONAL_INCOME_TAX_REVENUE = data.personal_income_tax_revenue;
  this.VAT_REVENUE = data.vat_revenue;

  // Budget expenditure by category, in millions
  // see https://docs.google.com/spreadsheets/d/18pS6-GXmV2AE6TqKtYYzL6Ag-ZuwiE4jb53U9heWF1M/edit#gid=0

  // Categorised expenditure (should, but doesn't have to, total to CONSOLIDATED_EXPENDITURE)
  this.EXPENDITURE = data.expenditure;

  // override ordering
  this.ORDERING = data.ordering || {
    'Working for yourself': 9999,
    'National debt': -1,
  };

  // Total budget expenditure
  this.CONSOLIDATED_EXPENDITURE = _.reduce(_.values(this.EXPENDITURE), function(t, n) { return t + n; }, 0);

  // fraction of budget line items that are funded through
  // personal tax and VAT
  this.TAXPAYER_RATIO = (this.PERSONAL_INCOME_TAX_REVENUE + this.VAT_REVENUE) / this.CONSOLIDATED_EXPENDITURE;

  // start of day as a moment.js object. The date is irrelevant.
  this.START_OF_DAY = START_OF_DAY;

  this.WORKDAY_HOURS = 8;
  this.WORKDAY_MINS = this.WORKDAY_HOURS * 60;
  this.END_OF_DAY = this.START_OF_DAY.clone().add(this.WORKDAY_MINS, 'minutes');

  this.calculateIncomeBreakdown = function(income) {
    var info = {};

    info.income = income;

    // income tax
    info.incomeTax = self.incomeTax(info);
    // after tax income
    info.netIncome = income - info.incomeTax;

    // VAT calculated on net income
    info.vatTax = self.vatTax(info);

    // total personal tax
    info.personalTax = info.incomeTax + info.vatTax;
    // income after tax and VAT
    info.disposableIncome = income - info.personalTax;

    // fraction of day spent working for yourself
    info.personal_fraction = info.disposableIncome / info.income;
    // times spent working for yourself
    info.personal_minutes = info.personal_fraction * self.WORKDAY_MINS;
    // times spent working for the man
    info.taxman_minutes = self.WORKDAY_MINS - info.personal_minutes;
    // fraction of day spent working for the man
    info.taxman_fraction = 1 - info.personal_fraction;

    info.breakdown = this.doBreakdown(info);

    // time spent working for myself
    info.breakdown.push(this.workingForSelf(info));
    
    // sort
    info.breakdown = _.sortBy(info.breakdown, function(b) {
      return self.ORDERING[b.name] || -b.fraction;
    });

    // add times of day
    this.addTimesOfDay(info.breakdown);

    return info;
  };

  this.incomeTax = function(info) {
    var gross_income_tax = 0;
    var band = _.find(this.TAX_TABLE, function(b) {
      return (info.income >= b.threshold) && (info.income <= b.limit);
    });

    if (band) {
      gross_income_tax = band.baseAmount + (band.marginalRate * (info.income - band.threshold));
      gross_income_tax = gross_income_tax - this.PRIMARY_REBATE;
    }

    if (gross_income_tax < 0) gross_income_tax = 0;

    return gross_income_tax;
  };

  this.vatTax = function(info) {
    return info.netIncome * this.VAT / (1 + this.VAT);
  };

  this.workingForSelf = function(info) {
    return {
      name: 'Working for yourself',
      amount: info.income,
      taxpayer_amount: info.disposableIncome,
      fraction: info.personal_fraction,
      minutes: info.personal_minutes,
    };
  };

  this.doBreakdown = function(info) {
    return _.map(this.EXPENDITURE, function(amount, category) {
      // scale amount to that contributed by personal taxpayers
      var taxpayer_amount = self.TAXPAYER_RATIO * amount;
      var fraction = amount / self.CONSOLIDATED_EXPENDITURE * info.taxman_fraction;

      return {
        name: category,
        // absolute amount from budget
        amount: amount,
        // amount contributed by the taxpayer
        taxpayer_amount: taxpayer_amount,
        // fraction of time spent on this amount
        fraction: fraction,
        // minutes per day spent on this amount
        minutes: self.WORKDAY_MINS * fraction,
      };
    });
  };

  this.addTimesOfDay = function(cats) {
    var time = this.START_OF_DAY;

    _.each(cats, function(cat) {
      // time of day when you FINISH working for this category
      time = time.clone().add(cat.minutes, 'm');

      cat.finish_time = time.clone();
      cat.finish_time_s = time.format('h:mm a');
    });
  };
};

function TaxBand(marginalRate, baseAmount, threshold, limit) {
    this.marginalRate = marginalRate;
    this.baseAmount = baseAmount;
    this.threshold = threshold;
    this.limit = (arguments.length > 3) ? this.limit = limit : this.limit = Number.POSITIVE_INFINITY;
}


var taxes_2017 = {
// tax bands -- with thanks to http://www.oldmutual.co.za/markets/south-african-budget/income-tax-calculator
    tax_table : [
        new TaxBand(0.18, 0, 0, 189880),
        new TaxBand(0.26, 34178, 189881, 296540),
        new TaxBand(0.31, 61910, 296541, 410460),
        new TaxBand(0.36, 97225, 410461, 555600),
        new TaxBand(0.39, 149475, 555601, 708310),
        new TaxBand(0.41, 209032, 708311, 1500000),
        new TaxBand(0.45, 533625, 1500001)
    ],
    primary_rebate : 13635,
    personal_income_tax_revenue : 482.1,
    vat_revenue : 312.8,
    expenditure : {
        'Basic education': 232600,
        'Higher education & training': 77500,
        'Health': 187500,
        'Social grants': 180000,
        'Employment & labour affairs': 75900,
        'Trade & industry': 28900,
        'Economic infrastructure': 89500,
        'Defence & state security': 54000,
        'Law courts & prisons': 43800,
        'Police services': 93800,
        'Home affairs': 7200,
        'Local government and housing': 195800,
        'Agriculture, rural development & land reform': 26500,
        'Science & Technology and environment': 20600,
        'Arts, sports, recreation and culture': 10400,
        'General public services': 70700,
        'National debt': 162400,
        'Unallocated reserves': 6000,
    },
    vat : 0.14
}


var taxes_2018 = {
// tax bands -- with thanks to http://www.oldmutual.co.za/markets/south-african-budget/income-tax-calculator
    tax_table : [
        new TaxBand(0.18, 0, 0, 195850),
        new TaxBand(0.26, 35253, 195851, 305850),
        new TaxBand(0.31, 63853, 305851, 423300),
        new TaxBand(0.36, 100263, 423301, 555600),
        new TaxBand(0.39, 147891, 555601, 708310),
        new TaxBand(0.41, 207448, 708311, 1500000),
        new TaxBand(0.45, 532041, 1500000)
    ],
    primary_rebate : 14067,
    personal_income_tax_revenue : 505.8,
    vat_revenue : 348.1,
    expenditure : {
        'Basic education': 246800,
        'Post-school education and training': 93700,
        'Arts, sports, recreation and culture': 10700,
        'Health': 205400,
        'Social protection': 193400,
        'Social security funds': 66000,
        'Community Development': 196300,
        'Industrialisation and exports': 32900,
        'Agriculture and rural development': 30200,
        'Job creation and labour affairs': 23300,
        'Economic regulation and infrastructure': 97900,
        'Defence & state security': 48400,
        'Police services': 99100,
        'Law courts & prisons': 45400,
        'Home affairs': 7900,
        'Executive and legislative organs': 16000,
        'Public administration and fiscal affairs': 40400,
        'External affairs': 7600,
        'Payments for financial assets': 6000,
        'Debt-service costs': 180000,
        'Contingency reserve': 8000,
    },
    vat : 0.15,
    ordering : {
      'Working for yourself': 9999,
      'Debt-service costs': -1,
    }
}

var taxes_2019 = {
// tax bands -- with thanks to http://www.oldmutual.co.za/markets/south-african-budget/income-tax-calculator
    tax_table : [
        new TaxBand(0.18, 0, 0, 195850),
        new TaxBand(0.26, 35253, 195851, 305850),
        new TaxBand(0.31, 63853, 305851, 423300),
        new TaxBand(0.36, 100263, 423301, 555600),
        new TaxBand(0.39, 147891, 555601, 708310),
        new TaxBand(0.41, 207448, 708311, 1500000),
        new TaxBand(0.45, 532041, 1500000)
    ],
    primary_rebate : 14220,
    personal_income_tax_revenue : 552900,
    vat_revenue : 360500,
    expenditure : {
        'Agriculture and rural development' : 30.7 * 100,
        'Arts, culture, sport and recreation' : 11.3 * 100,
        'Basic education' : 262.4 * 100,
        'Community development' : 208.5 * 100,
        'Contingency reserve' : 13 * 100,
        'Debt-service costs' : 202.2 * 100,
        'Defense and state security' : 50 * 100,
        'Economic regulation and infrastructure' : 101.3 * 100,
        'Executive and legislative organs' : 16.2 * 100,
        'External affairs' : 7.6 * 100,
        'Health' : 222.6 * 100,
        'Home affairs' : 8.4 * 100,
        'Industrialisation and exports' : 37.5 * 100,
        'Innovation, science and technology' : 16.5 * 100,
        'Job creation and labour affairs' : 23.2 * 100,
        'Law courts and prisons' : 48.4 * 100,
        'Payments for financial assets' : 29.8 * 100,
        'Police services' : 104.2 * 100,
        'Post-school education and training' : 112.7 * 100,
        'Public administration and fiscal affairs' : 41.6 * 100,
        'Social protection' : 207.1 * 100,
        'Social security funds' : 71.3 * 100,
    },
    vat : 0.15,
    ordering : {
      'Working for yourself': 9999,
      'Debt-service costs': -1,
    }
}
