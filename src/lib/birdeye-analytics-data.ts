export type BirdeyeCell = string | number;

export type BirdeyeAnalyticsTable = {
  id: string;
  title: string;
  category: string;
  sourceRange: string;
  sheetName: string;
  subtitle: string;
  labelKey: string;
  headers: string[];
  numericKeys: string[];
  rows: Array<Record<string, BirdeyeCell>>;
};

export const BIRDEYE_ANALYTICS_TABLES: BirdeyeAnalyticsTable[] = [
  {
    "id": "geo-delivery",
    "title": "FY by Geography and Delivery Type",
    "category": "Region",
    "sourceRange": "B3:F7",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "MS",
      "PS",
      "Grand Total",
      "Share"
    ],
    "numericKeys": [
      "MS",
      "PS",
      "Grand Total",
      "Share"
    ],
    "rows": [
      {
        "Row Labels": "ROW",
        "MS": 746383,
        "PS": 19038699,
        "Grand Total": 28629086,
        "Share": 0.63
      },
      {
        "Row Labels": "USA",
        "MS": 34355,
        "PS": 11526269,
        "Grand Total": 16886388,
        "Share": 0.37
      },
      {
        "Row Labels": "Grand Total",
        "MS": 14950507,
        "PS": 30564968,
        "Grand Total": 45515475,
        "Share": ""
      },
      {
        "Row Labels": "",
        "MS": 0.33,
        "PS": 0.67,
        "Grand Total": "",
        "Share": ""
      }
    ]
  },
  {
    "id": "project-lifecycle",
    "title": "FY by Project Lifecycle and Delivery Type",
    "category": "Lifecycle",
    "sourceRange": "B10:F16",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "MS",
      "PS",
      "Grand Total",
      "Share"
    ],
    "numericKeys": [
      "MS",
      "PS",
      "Grand Total",
      "Share"
    ],
    "rows": [
      {
        "Row Labels": "Existing",
        "MS": 435355,
        "PS": 10989278,
        "Grand Total": 15264927,
        "Share": 0.34
      },
      {
        "Row Labels": "Renewal",
        "MS": 5435,
        "PS": 15255482,
        "Grand Total": 22068819,
        "Share": 0.48
      },
      {
        "Row Labels": "New",
        "MS": 665656,
        "PS": 65465,
        "Grand Total": 65645,
        "Share": 0.18
      },
      {
        "Row Labels": "Grand Total",
        "MS": 14950507,
        "PS": 30564968,
        "Grand Total": 45515475,
        "Share": ""
      },
      {
        "Row Labels": "",
        "MS": 0.56,
        "PS": 0.56,
        "Grand Total": "",
        "Share": ""
      },
      {
        "Row Labels": "Growth (new)",
        "MS": 0.56,
        "PS": 0.22,
        "Grand Total": "",
        "Share": ""
      }
    ]
  },
  {
    "id": "engagement-delivery",
    "title": "FY by Engagement Type and Delivery Type",
    "category": "Engagement",
    "sourceRange": "B19:F23",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "MS",
      "PS",
      "Grand Total",
      "Share"
    ],
    "numericKeys": [
      "MS",
      "PS",
      "Grand Total",
      "Share"
    ],
    "rows": [
      {
        "Row Labels": "EE",
        "MS": 11088986,
        "PS": 26244760,
        "Grand Total": 37333746,
        "Share": 0.82
      },
      {
        "Row Labels": "EN",
        "MS": 5654,
        "PS": 7767,
        "Grand Total": 7567,
        "Share": 0.15
      },
      {
        "Row Labels": "NN",
        "MS": 75675,
        "PS": 75767,
        "Grand Total": 7567,
        "Share": 0.03
      },
      {
        "Row Labels": "Grand Total",
        "MS": 14950507,
        "PS": 30564968,
        "Grand Total": 45515475,
        "Share": ""
      }
    ]
  },
  {
    "id": "engagement-region",
    "title": "FY by Engagement Type and Region",
    "category": "Engagement",
    "sourceRange": "B27:E31",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "ROW",
      "USA",
      "Grand Total"
    ],
    "numericKeys": [
      "ROW",
      "USA",
      "Grand Total"
    ],
    "rows": [
      {
        "Row Labels": "EE",
        "ROW": 22599556,
        "USA": 14734189,
        "Grand Total": 37333746
      },
      {
        "Row Labels": "EN",
        "ROW": 65767,
        "USA": 567676,
        "Grand Total": 767675
      },
      {
        "Row Labels": "NN",
        "ROW": 765,
        "USA": 7567567,
        "Grand Total": 7657567
      },
      {
        "Row Labels": "Grand Total",
        "ROW": 28629086,
        "USA": 16886388,
        "Grand Total": 45515475
      }
    ]
  },
  {
    "id": "country-delivery",
    "title": "FY by Country and Delivery Type",
    "category": "Country",
    "sourceRange": "B35:E43",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "MS",
      "PS",
      "Grand Total"
    ],
    "numericKeys": [
      "MS",
      "PS",
      "Grand Total"
    ],
    "rows": [
      {
        "Row Labels": "GER",
        "MS": "",
        "PS": 7576576,
        "Grand Total": 3567
      },
      {
        "Row Labels": "IND",
        "MS": 357567,
        "PS": 757547,
        "Grand Total": 756
      },
      {
        "Row Labels": "MAL",
        "MS": 6756,
        "PS": 75677,
        "Grand Total": 6753
      },
      {
        "Row Labels": "MME",
        "MS": 5767,
        "PS": 3567,
        "Grand Total": 567567
      },
      {
        "Row Labels": "SIN",
        "MS": 657657,
        "PS": 367657,
        "Grand Total": 76537
      },
      {
        "Row Labels": "UKG",
        "MS": 467674,
        "PS": 657547,
        "Grand Total": 745676
      },
      {
        "Row Labels": "US",
        "MS": 575677,
        "PS": 11526269,
        "Grand Total": 16886388
      },
      {
        "Row Labels": "Grand Total",
        "MS": 675467,
        "PS": 30564968,
        "Grand Total": 45515475
      }
    ]
  },
  {
    "id": "vertical-delivery",
    "title": "FY by Vertical and Delivery Type",
    "category": "Vertical",
    "sourceRange": "B47:E53",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "MS",
      "PS",
      "Grand Total"
    ],
    "numericKeys": [
      "MS",
      "PS",
      "Grand Total"
    ],
    "rows": [
      {
        "Row Labels": "Hi-Tech",
        "MS": 456767,
        "PS": 89989,
        "Grand Total": 675788
      },
      {
        "Row Labels": "Medical/ Analytical",
        "MS": 7569,
        "PS": 681376,
        "Grand Total": 5789
      },
      {
        "Row Labels": "Semicon",
        "MS": 7689678,
        "PS": 789767,
        "Grand Total": 2911709
      },
      {
        "Row Labels": "Storage",
        "MS": 7689768,
        "PS": 79687,
        "Grand Total": 89787
      },
      {
        "Row Labels": "TBD",
        "MS": 76896,
        "PS": 19703261,
        "Grand Total": 19715261
      },
      {
        "Row Labels": "Grand Total",
        "MS": 770768,
        "PS": 30564968,
        "Grand Total": 45515475
      }
    ]
  },
  {
    "id": "strategic-delivery",
    "title": "FY by Strategic Account and Delivery Type",
    "category": "Strategic",
    "sourceRange": "B57:E60",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "MS",
      "PS",
      "Grand Total"
    ],
    "numericKeys": [
      "MS",
      "PS",
      "Grand Total"
    ],
    "rows": [
      {
        "Row Labels": "No",
        "MS": 67697,
        "PS": 10866031,
        "Grand Total": 14383348
      },
      {
        "Row Labels": "Yes",
        "MS": 6548677,
        "PS": 19698937,
        "Grand Total": 31132127
      },
      {
        "Row Labels": "Grand Total",
        "MS": 585679,
        "PS": 30564968,
        "Grand Total": 45515475
      }
    ]
  },
  {
    "id": "bdm-engagement",
    "title": "FY by BDM and Engagement Type",
    "category": "BDM",
    "sourceRange": "G3:K21",
    "sheetName": "Sheet1",
    "subtitle": "Give me month on Month Drill Down / Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "EE",
      "EN",
      "NN",
      "Grand Total"
    ],
    "numericKeys": [
      "EE",
      "EN",
      "NN",
      "Grand Total"
    ],
    "rows": [
      {
        "Row Labels": "Roshan",
        "EE": 9004757,
        "EN": 745600,
        "NN": 349600,
        "Grand Total": 10099957
      },
      {
        "Row Labels": "Santosh",
        "EE": 5480120,
        "EN": 340000,
        "NN": "",
        "Grand Total": 5820120
      },
      {
        "Row Labels": "Muhusin",
        "EE": 3942281,
        "EN": 1289956,
        "NN": 149994,
        "Grand Total": 5382231
      },
      {
        "Row Labels": "Sonu",
        "EE": 3157364,
        "EN": 314084,
        "NN": 255847,
        "Grand Total": 3727294
      },
      {
        "Row Labels": "Sayoni",
        "EE": 3112282,
        "EN": 254285,
        "NN": "",
        "Grand Total": 3366566
      },
      {
        "Row Labels": "Annie",
        "EE": 2040463,
        "EN": 799028,
        "NN": "",
        "Grand Total": 2839491
      },
      {
        "Row Labels": "Ali",
        "EE": 1934531,
        "EN": 149225,
        "NN": "-",
        "Grand Total": 2083756
      },
      {
        "Row Labels": "Pragathi",
        "EE": 1636872,
        "EN": 355000,
        "NN": "",
        "Grand Total": 1991872
      },
      {
        "Row Labels": "Apurva",
        "EE": 1453445,
        "EN": 359888,
        "NN": "",
        "Grand Total": 1813333
      },
      {
        "Row Labels": "Seetha",
        "EE": 1355227,
        "EN": 418342,
        "NN": "",
        "Grand Total": 1773569
      },
      {
        "Row Labels": "Vivek",
        "EE": 1159281,
        "EN": 207248,
        "NN": "",
        "Grand Total": 1366529
      },
      {
        "Row Labels": "Chang",
        "EE": 986388,
        "EN": 226988,
        "NN": "",
        "Grand Total": 1213376
      },
      {
        "Row Labels": "Desmond",
        "EE": 1026801,
        "EN": 153686,
        "NN": "",
        "Grand Total": 1180487
      },
      {
        "Row Labels": "Pooja V",
        "EE": 600310,
        "EN": 244513,
        "NN": "",
        "Grand Total": 844822
      },
      {
        "Row Labels": "Sanjay",
        "EE": 256746,
        "EN": 470517,
        "NN": 70419,
        "Grand Total": 797682
      },
      {
        "Row Labels": "Sneha",
        "EE": 186880,
        "EN": 562682,
        "NN": "",
        "Grand Total": 749561
      },
      {
        "Row Labels": "TBD",
        "EE": "",
        "EN": "",
        "NN": 464828,
        "Grand Total": 464828
      },
      {
        "Row Labels": "Grand Total",
        "EE": 37333746,
        "EN": 6891041,
        "NN": 1290688,
        "Grand Total": 45515475
      }
    ]
  },
  {
    "id": "customer-delivery",
    "title": "FY by Customer and Delivery Type",
    "category": "Customer",
    "sourceRange": "O3:R11",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "MS",
      "PS",
      "Grand Total"
    ],
    "numericKeys": [
      "MS",
      "PS",
      "Grand Total"
    ],
    "rows": [
      {
        "Row Labels": "MPHASIS CORPORATION USA",
        "MS": "",
        "PS": 5648679,
        "Grand Total": 697890
      },
      {
        "Row Labels": "DELOITTE CONSULTING",
        "MS": "",
        "PS": 586897,
        "Grand Total": 3095959
      },
      {
        "Row Labels": "NETAPP INC",
        "MS": 2536800,
        "PS": 587567,
        "Grand Total": 647686
      },
      {
        "Row Labels": "NetApp India Private Limited",
        "MS": 2853000,
        "PS": "",
        "Grand Total": 45435
      },
      {
        "Row Labels": "Johnson Controls India Pvt Ltd",
        "MS": 129600,
        "PS": 5345345,
        "Grand Total": 543545
      },
      {
        "Row Labels": "Philips India Limited",
        "MS": 1657200,
        "PS": "",
        "Grand Total": 5345345
      },
      {
        "Row Labels": "Fidelity TalentSource LLC",
        "MS": "",
        "PS": 45345,
        "Grand Total": 535
      },
      {
        "Row Labels": "HP Singapore (Private) Limited",
        "MS": "",
        "PS": 435345,
        "Grand Total": 435345
      }
    ]
  },
  {
    "id": "ms-customer-usd",
    "title": "MS Customer USD",
    "category": "Customer",
    "sourceRange": "T3:U16",
    "sheetName": "Sheet1",
    "subtitle": "",
    "labelKey": "MS Customer",
    "headers": [
      "MS Customer",
      "USD"
    ],
    "numericKeys": [
      "USD"
    ],
    "rows": [
      {
        "MS Customer": "Net App",
        "USD": 4535
      },
      {
        "MS Customer": "Waters",
        "USD": 5453453
      },
      {
        "MS Customer": "Phillips",
        "USD": 354
      },
      {
        "MS Customer": "Analog Devices Inc",
        "USD": 34534
      },
      {
        "MS Customer": "New",
        "USD": 3454
      },
      {
        "MS Customer": "Veeco",
        "USD": 325345
      },
      {
        "MS Customer": "Nexperia",
        "USD": 4255
      },
      {
        "MS Customer": "HP",
        "USD": 43532
      },
      {
        "MS Customer": "Avantel",
        "USD": 5435
      },
      {
        "MS Customer": "Shimatzu",
        "USD": 5325
      },
      {
        "MS Customer": "Meshnet",
        "USD": 6784
      },
      {
        "MS Customer": "Elekta",
        "USD": 86678
      },
      {
        "MS Customer": "Purestorage",
        "USD": 8647
      }
    ]
  },
  {
    "id": "ee-customer-fy",
    "title": "EE Customer FY",
    "category": "Customer",
    "sourceRange": "W3:X12",
    "sheetName": "Sheet1",
    "subtitle": "",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "Sum of FY"
    ],
    "numericKeys": [
      "Sum of FY"
    ],
    "rows": [
      {
        "Row Labels": "EE",
        "Sum of FY": "#########"
      },
      {
        "Row Labels": "MPHASIS CORPORATION USA",
        "Sum of FY": 4044495
      },
      {
        "Row Labels": "DELOITTE CONSULTING",
        "Sum of FY": 2959759
      },
      {
        "Row Labels": "NetApp India Private Limited",
        "Sum of FY": 2813000
      },
      {
        "Row Labels": "NETAPP INC",
        "Sum of FY": 2667120
      },
      {
        "Row Labels": "Philips India Limited",
        "Sum of FY": 1477200
      },
      {
        "Row Labels": "Fidelity TalentSource LLC",
        "Sum of FY": 1399501
      },
      {
        "Row Labels": "Johnson Controls India Pvt Ltd",
        "Sum of FY": 1334576
      },
      {
        "Row Labels": "HP Singapore (Private) Limited",
        "Sum of FY": 1278894
      }
    ]
  },
  {
    "id": "bdm-region-drilldown",
    "title": "BDM Region Drill Down",
    "category": "Drill Down",
    "sourceRange": "Z4:AC36",
    "sheetName": "Sheet1",
    "subtitle": "Sum of FY / Column Labels",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "ROW",
      "USA",
      "Grand Total"
    ],
    "numericKeys": [
      "ROW",
      "USA",
      "Grand Total"
    ],
    "rows": [
      {
        "Row Labels": "EE",
        "ROW": 22599556,
        "USA": "#########",
        "Grand Total": "#########"
      },
      {
        "Row Labels": "Roshan",
        "ROW": "",
        "USA": 4366,
        "Grand Total": 9004757
      },
      {
        "Row Labels": "Santosh",
        "ROW": 453,
        "USA": 6346,
        "Grand Total": 643646
      },
      {
        "Row Labels": "Muhusin",
        "ROW": 34635,
        "USA": 6463,
        "Grand Total": 3634
      },
      {
        "Row Labels": "Sonu",
        "ROW": 634656,
        "USA": 34545,
        "Grand Total": 63463
      },
      {
        "Row Labels": "Sayoni",
        "ROW": 46466,
        "USA": 43546,
        "Grand Total": 46463
      },
      {
        "Row Labels": "Annie",
        "ROW": 6464,
        "USA": 34534,
        "Grand Total": 6356
      },
      {
        "Row Labels": "EN",
        "ROW": 56487,
        "USA": 66,
        "Grand Total": 653635
      },
      {
        "Row Labels": "Muhusin",
        "ROW": 53636,
        "USA": "",
        "Grand Total": 5636
      },
      {
        "Row Labels": "Annie",
        "ROW": 799028,
        "USA": "",
        "Grand Total": 799028
      },
      {
        "Row Labels": "Roshan",
        "ROW": "",
        "USA": 745600,
        "Grand Total": 745600
      },
      {
        "Row Labels": "Sneha",
        "ROW": 56345,
        "USA": 435,
        "Grand Total": 76787
      },
      {
        "Row Labels": "Sanjay",
        "ROW": 41345,
        "USA": "",
        "Grand Total": 458976
      },
      {
        "Row Labels": "Seetha",
        "ROW": 5345,
        "USA": "",
        "Grand Total": 8769
      },
      {
        "Row Labels": "Apurva",
        "ROW": 43543,
        "USA": "",
        "Grand Total": 5468
      },
      {
        "Row Labels": "Pragathi",
        "ROW": "",
        "USA": 355000,
        "Grand Total": 5648
      },
      {
        "Row Labels": "Santosh",
        "ROW": 40000,
        "USA": 300000,
        "Grand Total": 340000
      },
      {
        "Row Labels": "Sonu",
        "ROW": 67589,
        "USA": "",
        "Grand Total": 765767
      },
      {
        "Row Labels": "Sayoni",
        "ROW": 65989,
        "USA": "",
        "Grand Total": 75678
      },
      {
        "Row Labels": "Pooja V",
        "ROW": 6589,
        "USA": "",
        "Grand Total": 89795
      },
      {
        "Row Labels": "Chang",
        "ROW": 65879,
        "USA": "",
        "Grand Total": 234437
      },
      {
        "Row Labels": "Vivek",
        "ROW": 5697,
        "USA": "",
        "Grand Total": 54648
      },
      {
        "Row Labels": "Desmond",
        "ROW": 569780,
        "USA": "",
        "Grand Total": 685867
      },
      {
        "Row Labels": "Ali",
        "ROW": 87656,
        "USA": "",
        "Grand Total": 149225
      },
      {
        "Row Labels": "NN",
        "ROW": 739089,
        "USA": 551599,
        "Grand Total": 1290688
      },
      {
        "Row Labels": "TBD",
        "ROW": 414828,
        "USA": 50000,
        "Grand Total": 464828
      },
      {
        "Row Labels": "Roshan",
        "ROW": "",
        "USA": 349600,
        "Grand Total": 349600
      },
      {
        "Row Labels": "Sonu",
        "ROW": 103848,
        "USA": 151999,
        "Grand Total": 255847
      },
      {
        "Row Labels": "Muhusin",
        "ROW": 149994,
        "USA": "",
        "Grand Total": 149994
      },
      {
        "Row Labels": "Sanjay",
        "ROW": 70419,
        "USA": "",
        "Grand Total": 70419
      },
      {
        "Row Labels": "Ali",
        "ROW": 0,
        "USA": "",
        "Grand Total": 0
      },
      {
        "Row Labels": "Grand Total",
        "ROW": 28629086,
        "USA": "#########",
        "Grand Total": "#########"
      }
    ]
  },
  {
    "id": "month-drilldown",
    "title": "Month on Month Drill Down",
    "category": "Month",
    "sourceRange": "AE3:AI15",
    "sheetName": "Sheet1",
    "subtitle": "Give me month on Month Drill Down",
    "labelKey": "Row Labels",
    "headers": [
      "Row Labels",
      "Sum of Apr 2026",
      "Sum of May 2026",
      "Sum of Jun 2026",
      "Sum of FY"
    ],
    "numericKeys": [
      "Sum of Apr 2026",
      "Sum of May 2026",
      "Sum of Jun 2026",
      "Sum of FY"
    ],
    "rows": [
      {
        "Row Labels": "MS",
        "Sum of Apr 2026": 3653656,
        "Sum of May 2026": 63666,
        "Sum of Jun 2026": 635656,
        "Sum of FY": "##########"
      },
      {
        "Row Labels": "NetApp India Private Limited",
        "Sum of Apr 2026": 6536,
        "Sum of May 2026": 5656,
        "Sum of Jun 2026": 65636,
        "Sum of FY": 6346346
      },
      {
        "Row Labels": "NETAPP INC",
        "Sum of Apr 2026": 196600,
        "Sum of May 2026": 634634,
        "Sum of Jun 2026": 4634646,
        "Sum of FY": 34646
      },
      {
        "Row Labels": "OSRAM Opto Semiconductors (Malaysia) Sdn. Bhd.",
        "Sum of Apr 2026": "-",
        "Sum of May 2026": "-",
        "Sum of Jun 2026": 34646,
        "Sum of FY": 6436
      },
      {
        "Row Labels": "Education & Training Quality Authority",
        "Sum of Apr 2026": 64364,
        "Sum of May 2026": 436,
        "Sum of Jun 2026": 3466,
        "Sum of FY": 63
      },
      {
        "Row Labels": "OLYMPUS SURGICAL TECHNOLOGIES EUROPE",
        "Sum of Apr 2026": 6436,
        "Sum of May 2026": 6436,
        "Sum of Jun 2026": 646,
        "Sum of FY": 63466
      },
      {
        "Row Labels": "PS",
        "Sum of Apr 2026": 6346,
        "Sum of May 2026": 346436,
        "Sum of Jun 2026": 6346,
        "Sum of FY": 45345
      },
      {
        "Row Labels": "MPHASIS CORPORATION USA",
        "Sum of Apr 2026": 347325,
        "Sum of May 2026": 315750,
        "Sum of Jun 2026": 335178,
        "Sum of FY": 466
      },
      {
        "Row Labels": "DELOITTE CONSULTING",
        "Sum of Apr 2026": 3453,
        "Sum of May 2026": 53455,
        "Sum of Jun 2026": 543534,
        "Sum of FY": 453455
      },
      {
        "Row Labels": "Johnson Controls India Pvt Ltd",
        "Sum of Apr 2026": 34545,
        "Sum of May 2026": 53453,
        "Sum of Jun 2026": 345345,
        "Sum of FY": 3454
      },
      {
        "Row Labels": "Fidelity TalentSource LLC",
        "Sum of Apr 2026": 353454,
        "Sum of May 2026": 34535,
        "Sum of Jun 2026": 125966,
        "Sum of FY": 1564381
      },
      {
        "Row Labels": "HP Singapore (Private) Limited",
        "Sum of Apr 2026": 122216,
        "Sum of May 2026": 121270,
        "Sum of Jun 2026": 127943,
        "Sum of FY": 1502978
      }
    ]
  }
];
