'use client';

import '@ant-design/v5-patch-for-react-19';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Flex, Form, Input, Typography, message } from 'antd';
import { AppLoading } from './components/app-loading';

type LoginFormValues = {
  email: string;
  password: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3399';

export function LoginForm() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    let cancelled = false;

    const bootstrapSession = async () => {
      const existingToken = localStorage.getItem('teamsight_token');

      if (!existingToken) {
        if (!cancelled) {
          setSessionChecking(false);
        }
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${existingToken}`
          }
        });

        const data = (await response.json()) as {
          user?: { name?: string };
        };

        if (!response.ok || !data.user?.name) {
          localStorage.removeItem('teamsight_token');
          localStorage.removeItem('teamsight_user_name');
          return;
        }

        localStorage.setItem('teamsight_user_name', data.user.name);
        router.replace('/people/progress');
        return;
      } catch {
        localStorage.removeItem('teamsight_token');
        localStorage.removeItem('teamsight_user_name');
      } finally {
        if (!cancelled) {
          setSessionChecking(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [mounted, router]);

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

      messageApi.success(`Bem-vindo, ${data.user?.name ?? 'usuário'}!`);
      localStorage.setItem('teamsight_token', data.token);
      localStorage.setItem('teamsight_user_name', data.user?.name ?? 'Usuário');
      router.replace('/people/progress');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro inesperado';
      messageApi.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || sessionChecking) {
    return <AppLoading />;
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
      {contextHolder}
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
          Usuário padrão: luiz.valentin@allstrategy.com.br / 123456789
        </Typography.Paragraph>
      </Card>
    </Flex>
  );
}
