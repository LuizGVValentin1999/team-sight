'use client';

import { useState } from 'react';
import { Button, Card, Flex, Form, Input, Typography, message } from 'antd';

type LoginFormValues = {
  email: string;
  password: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });

      const data = (await response.json()) as {
        token?: string;
        user?: { name: string; role: string };
        message?: string;
      };

      if (!response.ok || !data.token) {
        throw new Error(data.message ?? 'Falha ao autenticar');
      }

      message.success(`Bem-vindo, ${data.user?.name ?? 'usuário'}!`);
      localStorage.setItem('teamsight_token', data.token);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro inesperado';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Flex vertical gap={6} style={{ marginBottom: 24 }}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            TeamSight
          </Typography.Title>
          <Typography.Text type="secondary">
            Gestão integrada de times Dev, QA, PO e UX
          </Typography.Text>
        </Flex>

        <Form<LoginFormValues> layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="E-mail"
            name="email"
            rules={[
              { required: true, message: 'Informe seu e-mail' },
              { type: 'email', message: 'E-mail inválido' }
            ]}
          >
            <Input placeholder="voce@empresa.com" size="large" />
          </Form.Item>

          <Form.Item
            label="Senha"
            name="password"
            rules={[{ required: true, message: 'Informe sua senha' }]}
          >
            <Input.Password placeholder="Sua senha" size="large" />
          </Form.Item>

          <Button block type="primary" htmlType="submit" size="large" loading={loading}>
            Entrar
          </Button>
        </Form>

        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          Usuário padrão: admin@teamsight.local / 123456
        </Typography.Paragraph>
      </Card>
    </Flex>
  );
}
