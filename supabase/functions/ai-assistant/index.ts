import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Разрешаем браузеру делать запросы (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Получаем данные от React-приложения
    const { taskTitle, taskDescription, type } = await req.json()
    
    // 3. Берем ключ (убедись, что ты его добавил в секреты!)
    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      throw new Error('Не найден ключ GOOGLE_API_KEY в секретах Supabase')
    }
    
    // 4. Формируем инструкцию для ИИ
    let prompt = ""
    
    if (type === 'web_search') {
        prompt = `Задача пользователя: "${taskTitle}". 
        Детали: "${taskDescription || 'нет'}". 
        Твоя цель: Помочь найти информацию.
        Напиши 3 самых эффективных поисковых запроса для Google, чтобы решить эту задачу.
        И дай один короткий совет эксперта, на что обратить внимание.`
    } else {
        const action = type === 'whatsapp' ? 'WhatsApp' : 'Email';
        prompt = `Твоя роль: Личный бизнес-ассистент.
        Задача: Написать текст сообщения для отправки в ${action}.
        Тема: "${taskTitle}".
        Детали: "${taskDescription || 'нет'}".
        
        Требования:
        1. Стиль: Вежливый, деловой, лаконичный.
        2. Без воды (не пиши "Вот ваш текст", "Тема письма:").
        3. Сразу готовый текст, который можно скопировать и отправить.`
    }

    // 5. Отправляем запрос к Gemini 2.0 Flash
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        }),
      }
    )

    const data = await response.json()
    
    if (data.error) {
      console.error("Gemini API Error:", data.error)
      throw new Error(data.error.message || "Ошибка API Google")
    }
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "ИИ не вернул текст. Попробуйте позже."

    // 6. Отправляем ответ обратно в приложение
    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("Function Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})