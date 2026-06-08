import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

random.seed(42)
np.random.seed(42)

# ====================== YOUR EXACT LISTS ======================
practice_heads = ['deepika', 'anushka', 'aishwarya', 'spandana', 'kriti']
bdms = ['salman', 'shah rukh', 'amir', 'hrithik']
geo_heads = ['amitabh', 'henry cavill', 'virat kholi']
verticals = ['storage', 'Hi-Tech', 'Medical/Analytical', 'TBD', 'Semicon']
horizontals = ['Software Developer', 'Solution Architect', 'Project Manager', 'Data Engineer', 
               'Cloud Consultant', 'DevOps Engineer', 'QA Tester', 'Business Analyst']
entities = ['IND', 'MAL', 'GER', 'SIN', 'USN']
gr_entities = ['IND', 'MAL', 'GER', 'SIN', 'USAW']
row_us_options = ['ROW', 'US']
deal_types = ['Existing', 'renewal', 'new']
eeennn_options = ['EE', 'EN', 'NN']
strategic_options = ['yes', 'no']

companies = ['TCS', 'Infosys', 'Wipro', 'HCL Technologies', 'Tech Mahindra', 'Cognizant', 
             'Accenture', 'IBM', 'Deloitte', 'Capgemini', 'Oracle', 'SAP', 'Microsoft', 
             'Amazon', 'Google', 'Adobe', 'Cisco', 'Intel', 'Qualcomm', 'Texas Instruments'] * 12

first_names = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Neha', 'Arjun', 'Pooja', 'Rohan', 
               'Anjali', 'Karan', 'Meera', 'Siddharth', 'Riya', 'Aditya', 'Ishita', 'Vivek', 
               'Shalini', 'Nikhil', 'Pallavi']
last_names = ['Sharma', 'Singh', 'Patel', 'Gupta', 'Kumar', 'Reddy', 'Rao', 'Nair', 'Iyer', 
              'Menon', 'Bose', 'Chopra', 'Malhotra', 'Verma']
resource_names_list = [f"{fn} {ln}" for fn in first_names for ln in last_names][:200]

months = ['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 
          'Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027']

# ====================== GENERATE DATA ======================
data = []

# 165 MS rows
for _ in range(165):
    row = {
        'Customer Name': random.choice(companies),
        'MS/PS': 'MS',
        'Resource Name': '',
        'Resource ID': '',
        'Entity': random.choice(entities),
        'GR Entity': random.choice(gr_entities),
        'ROW/US': random.choice(row_us_options),
        'Strategic Account': random.choice(strategic_options),
        'Deal Type': random.choice(deal_types),
        'EEENNN': random.choice(eeennn_options),
        'Bill Rate': '',
        'Start Date': '',
        'End Date': '',
        'Project Name': f"{random.choice(companies)} - Managed Services Contract",
        'Practice Head': random.choice(practice_heads),
        'BDM': random.choice(bdms),
        'GeoHead': random.choice(geo_heads),
        'Vertical': random.choice(verticals),
        'Horizontal': 'Managed Services'
    }
    monthly = np.random.randint(500000, 5000001, 12)
    for m, val in zip(months, monthly):
        row[m] = int(val)
    row['FY'] = int(sum(monthly))
    row['Q1'] = row['Apr 2026'] + row['May 2026'] + row['Jun 2026']
    row['Q2'] = row['Jul 2026'] + row['Aug 2026'] + row['Sep 2026']
    row['Q3'] = row['Oct 2026'] + row['Nov 2026'] + row['Dec 2026']
    row['Q4'] = row['Jan 2027'] + row['Feb 2027'] + row['Mar 2027']
    data.append(row)

# 835 PS rows (with exact zero logic you asked for)
for _ in range(835):
    row = {
        'Customer Name': random.choice(companies),
        'MS/PS': 'PS',
        'Resource Name': random.choice(resource_names_list),
        'Resource ID': f"EGC{random.randint(11, 999)}",
        'Entity': random.choice(entities),
        'GR Entity': random.choice(gr_entities),
        'ROW/US': random.choice(row_us_options),
        'Strategic Account': random.choice(strategic_options),
        'Deal Type': random.choice(deal_types),
        'EEENNN': random.choice(eeennn_options),
        'Bill Rate': random.randint(200000, 1200000),
        'Project Name': f"{random.choice(companies)} - {random.choice(horizontals)} Engagement",
        'Practice Head': random.choice(practice_heads),
        'BDM': random.choice(bdms),
        'GeoHead': random.choice(geo_heads),
        'Vertical': random.choice(verticals),
        'Horizontal': random.choice(horizontals)
    }

    # Project end/start logic you specified
    prob = random.random()
    if prob < 0.25:                                 # Ends in June → Jul–Mar = 0
        start_d = datetime(2026, 4, random.randint(1, 15))
        end_d = datetime(2026, 6, random.randint(20, 30))
        active = ['Apr 2026', 'May 2026', 'Jun 2026']
    elif prob < 0.5:                                # Starts in July → Apr–Jun = 0
        start_d = datetime(2026, 7, random.randint(1, 15))
        end_d = datetime(2027, 3, random.randint(20, 31))
        active = ['Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 
                  'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027']
    else:                                           # Full or overlapping
        start_d = datetime(2026, random.randint(4, 7), random.randint(1, 28))
        end_d = start_d + timedelta(days=random.randint(180, 330))
        if end_d > datetime(2027, 3, 31):
            end_d = datetime(2027, 3, 31)
        month_starts = {m: datetime(int(m[-4:]), int(m[:3].replace('Apr','4').replace('May','5').replace('Jun','6').replace('Jul','7').replace('Aug','8').replace('Sep','9').replace('Oct','10').replace('Nov','11').replace('Dec','12').replace('Jan','1').replace('Feb','2').replace('Mar','3')), 1) for m in months}
        active = [m for m, mstart in month_starts.items() if start_d <= mstart.replace(day=28) <= end_d]

    row['Start Date'] = start_d.strftime('%d-%b-%Y')
    row['End Date'] = end_d.strftime('%d-%b-%Y')

    for m in months:
        row[m] = int(row['Bill Rate'] * random.uniform(0.85, 1.05)) if m in active else 0

    row['FY'] = sum(row[m] for m in months)
    row['Q1'] = row['Apr 2026'] + row['May 2026'] + row['Jun 2026']
    row['Q2'] = row['Jul 2026'] + row['Aug 2026'] + row['Sep 2026']
    row['Q3'] = row['Oct 2026'] + row['Nov 2026'] + row['Dec 2026']
    row['Q4'] = row['Jan 2027'] + row['Feb 2027'] + row['Mar 2027']
    data.append(row)

# ====================== CREATE EXCEL WITH EXACT COLUMN ORDER ======================
df = pd.DataFrame(data)

column_order = [
    'Customer Name', 'MS/PS', 'Resource Name', 'Resource ID', 'Entity', 'GR Entity',
    'ROW/US', 'Strategic Account', 'Deal Type', 'EEENNN', 'Bill Rate', 'Start Date', 'End Date',
    'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026',
    'Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027',
    'FY', 'Project Name', 'Practice Head', 'BDM', 'GeoHead', 'Vertical', 'Horizontal',
    'Q1', 'Q2', 'Q3', 'Q4'
]

df = df[column_order]

df.to_excel('rapid_revenue_data.xlsx', index=False)

print("✅ SUCCESS! File saved as 'rapid_revenue_data.xlsx'")
print(f"Total rows: {len(df)} | MS: 165 | PS: 835")
print("You can now upload this Excel directly into your RAPID dashboard.")