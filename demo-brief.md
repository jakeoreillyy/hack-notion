# CS3xx Software Engineering: Retail Management System

Group project, teams of 5 | 40% of module
Start: Mon 12 Oct 2026
Deadline: Fri 4 Dec 2026, 17:00

## Brief

Your team has been hired by a small chain of three retail shops to replace its spreadsheets with a working Retail Management System. You will take it from analysis through design, implementation and testing, and deliver a working system with supporting documentation.

1. Analysis. Produce a Software Requirements Specification with at least 12 functional and 5 non-functional requirements. Include a use case diagram with written use case descriptions for the five most important use cases. Produce a domain model.

2. Design. Produce a UML class diagram, at least two sequence diagrams (for example, "process a sale" and "restock an item"), and a database schema (ER diagram).

3. Implementation. Build a working application in a language of your choice with these modules: staff login with roles (cashier, manager), inventory management, point-of-sale (basket, payment, receipt), and a sales report for managers. Data must persist in a database.

4. Testing. Write a test plan. Implement unit tests for core logic, with at least 60% coverage of the sales and inventory modules. Run system tests against your use cases and record the results in a test report.

5. Documentation and delivery. Submit a final report (max 20 pages) combining the above. Give a 10-minute live demo in week 9. Keep all work in a shared Git repository with commits from every member.

## Rubric (100 marks)

Criterion 1: Requirements and use cases: completeness, clarity, testability (15 marks)
Criterion 2: Analysis and design models: correct UML, consistency between diagrams (20 marks)
Criterion 3: Implementation: working features, code quality, database use (25 marks)
Criterion 4: Testing: test plan, unit test coverage, system test evidence (15 marks)
Criterion 5: Traceability: each requirement mapped to a design element and a test (5 marks)
Criterion 6: Final report: structure, writing, referencing (10 marks)
Criterion 7: Live demo and Q&A (5 marks)
Criterion 8: Teamwork: team agreement, fair contribution, evidence of collaboration in Git (5 marks)

Total: 100 marks

## Team

Aoife: Java/backend, SQL, testing. 6 hours/week.
Sam: Backend, database design, UML. 10 hours/week.
Liam: Front end, UI, demo/presenting. 8 hours/week.
Mei: UML/modelling, requirements, writing. 8 hours/week.
Dara: Writing, referencing, documentation. 5 hours/week.

---

## Demo notes (for the team only, do NOT paste into the app)

Built-in traps so the demo shows something interesting:

- Overload: Aoife is the only one with both testing and strong Java skills, and has only 6 hours a week. The scheduler should push her well over her availability, so the load view shows a red bar.
- Rubric gap: Criterion 5 (traceability) is only hinted at in the brief, so the AI may not create a task for it. If it does, delete that task from the seed plan so the coverage gap still appears on screen. Criterion 8 (teamwork) is a likely second gap.
- Replan: "Sam is sick for 4 days" hits him during implementation, when he holds the database and login tasks. His work shifts to Aoife, who is already stretched, so the diff shows dates slipping and a low-slack warning.
