from app.core.database import SessionLocal
from app.models.models import User, Expense, ApprovalRule, ApprovalStep, ExpenseStatus

db = SessionLocal()
admin_user = db.query(User).filter(User.role == 'admin').first()
if not admin_user:
    print("No admin user found.")
else:
    print(f"Admin found: {admin_user.email}, Company: {admin_user.company_id}")
    
    # Run the query
    queue_query = (
        db.query(Expense)
        .join(ApprovalRule, Expense.approval_rule_id == ApprovalRule.id)
        .join(ApprovalStep, ApprovalStep.rule_id == ApprovalRule.id)
        .join(User, Expense.submitted_by == User.id)
        .filter(
            Expense.status == ExpenseStatus.pending,
            Expense.company_id == admin_user.company_id,
            Expense.deleted_at.is_(None),
            ApprovalStep.step_order == Expense.current_step,
            ApprovalStep.deleted_at.is_(None),
        )
    )
    
    
    expenses = queue_query.all()
    
    # Try without JOINs
    all_pending = db.query(Expense).filter(
        Expense.status == ExpenseStatus.pending,
        Expense.company_id == admin_user.company_id
    ).all()
    
    with open('pytest_result.txt', 'w') as f:
        f.write(f"Admin found: {admin_user.email}, Company: {admin_user.company_id}\n")
        f.write(f"Expenses found with JOINs: {len(expenses)}\n")
        f.write(f"All pending expenses (NO JOINs): {len(all_pending)}\n")
        
        if all_pending:
            exp = all_pending[0]
            f.write(f"\nExpense Details:\n")
            f.write(f"  id: {exp.id}\n")
            f.write(f"  status: {exp.status}\n")
            f.write(f"  current_step: {exp.current_step}\n")
            f.write(f"  approval_rule_id: {exp.approval_rule_id}\n")
            
            if exp.approval_rule_id:
                rule = db.query(ApprovalRule).filter(ApprovalRule.id == exp.approval_rule_id).first()
                f.write(f"  Rule: {rule.name} (deleted_at: {rule.deleted_at})\n")
                
                steps = db.query(ApprovalStep).filter(ApprovalStep.rule_id == rule.id).all()
                f.write(f"  Steps for rule (count={len(steps)}):\n")
                for s in steps:
                    f.write(f"    step_order: {s.step_order}, deleted_at: {s.deleted_at}\n")
