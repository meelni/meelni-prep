-- Check question type distribution
SELECT question_type, COUNT(*) as count 
FROM interview_question 
WHERE is_active = true
GROUP BY question_type 
ORDER BY question_type;

-- Get distinct question types
SELECT DISTINCT question_type 
FROM interview_question 
ORDER BY question_type;

-- Sample questions for each type mapping
SELECT 'Behavioral Questions:' as info;
SELECT company, LEFT(question_text, 80) as question_preview, question_type 
FROM interview_question 
WHERE question_type = 'Behavioral' AND is_active = true
LIMIT 5;

SELECT 'Product Sense Questions:' as info;
SELECT company, LEFT(question_text, 80) as question_preview, question_type 
FROM interview_question 
WHERE question_type = 'Product Sense' AND is_active = true
LIMIT 5;

SELECT 'Execution Questions:' as info;
SELECT company, LEFT(question_text, 80) as question_preview, question_type 
FROM interview_question 
WHERE question_type = 'Execution' AND is_active = true
LIMIT 5;

SELECT 'Product Strategy Questions:' as info;
SELECT company, LEFT(question_text, 80) as question_preview, question_type 
FROM interview_question 
WHERE question_type = 'Product Strategy' AND is_active = true
LIMIT 5;
